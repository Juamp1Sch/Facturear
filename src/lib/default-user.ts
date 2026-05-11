import { prisma } from "@/lib/db";

const DEFAULT_EMAIL =
  process.env.DEFAULT_USER_EMAIL?.trim() || "demo@facturear.local";

export async function getDefaultUserId(): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email: DEFAULT_EMAIL },
  });
  if (!user) {
    throw new Error(
      `No user found for ${DEFAULT_EMAIL}. Run: npm run db:seed (after DATABASE_URL and prisma db push).`,
    );
  }
  return user.id;
}
