import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { LoginSchema } from "@/lib/auth-schemas";

/**
 * Auth.js reads `AUTH_SECRET` (or legacy `NEXTAUTH_SECRET`).
 * Plain `npx auth secret` often resolves to the unrelated "auth" (Better Auth) CLI
 * and writes `BETTER_AUTH_SECRET` — we accept that name so local setups still work.
 */
function resolveAuthSecret(): string {
  const fromEnv =
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing AUTH_SECRET (or NEXTAUTH_SECRET). Set it before building for production.",
    );
  }
  return "dev-only-insecure-secret-do-not-use-in-production";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: resolveAuthSecret(),
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/iniciar-sesion" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const [{ prisma }, bcrypt, rateLimit] = await Promise.all([
          import("@/lib/db"),
          import("bcryptjs"),
          import("@/lib/rate-limit"),
        ]);

        const email = parsed.data.email.toLowerCase();
        // Límites acá (y no solo en la server action) porque el endpoint
        // /api/auth/callback/credentials también llega a authorize(). signIn() desde la
        // action reenvía los headers originales, así que la IP es la del cliente en ambos casos.
        const emailKey = rateLimit.loginEmailKey(email);
        const ipKey = rateLimit.loginIpKey(rateLimit.clientIpFromHeaders(request.headers));
        const [emailBlocked, ipBlocked] = await Promise.all([
          rateLimit.rateLimitRemainingMs(emailKey, rateLimit.LOGIN_EMAIL_RULE),
          rateLimit.rateLimitRemainingMs(ipKey, rateLimit.LOGIN_IP_RULE),
        ]);
        if (emailBlocked > 0 || ipBlocked > 0) return null;

        const recordFailure = () =>
          Promise.all([
            rateLimit.recordRateLimitHit(emailKey, rateLimit.LOGIN_EMAIL_RULE),
            rateLimit.recordRateLimitHit(ipKey, rateLimit.LOGIN_IP_RULE),
          ]);

        const user = await prisma.user.findUnique({
          where: { email },
        });
        if (!user?.passwordHash) {
          await recordFailure();
          return null;
        }

        const ok = await bcrypt.default.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!ok) {
          await recordFailure();
          return null;
        }
        if (!user.emailVerifiedAt) return null;
        await rateLimit.clearRateLimit(emailKey);

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
