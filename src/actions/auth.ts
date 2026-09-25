"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import {
  LoginSchema,
  RegisterSchema,
  RequestPasswordResetSchema,
  ResetPasswordSchema,
  VerifyRegistrationSchema,
} from "@/lib/auth-schemas";
import { isDatabaseConfigured } from "@/lib/database-config";
import { prisma } from "@/lib/db";
import {
  isSmtpConfigured,
  sendPasswordResetApprovalEmail,
  sendRegistrationApprovalEmail,
} from "@/lib/email";
import {
  ACCOUNT_REQUEST_IP_RULE,
  LOGIN_EMAIL_RULE,
  LOGIN_IP_RULE,
  accountRequestIpKey,
  getClientIp,
  loginEmailKey,
  loginIpKey,
  rateLimitMessage,
  rateLimitRemainingMs,
  recordRateLimitHit,
} from "@/lib/rate-limit";
import { safeCallbackUrl } from "@/lib/safe-callback-url";
import {
  generateVerificationToken,
  hashVerificationToken,
  passwordResetTokenExpiresAt,
  verificationTokenExpiresAt,
  verificationTokensMatch,
} from "@/lib/verification-token";

const PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE =
  "Si tu cuenta es válida, el administrador recibirá un código de restablecimiento. Pedilo para continuar. El código vence en 12 horas.";

/** Aplica el límite de solicitudes por IP a registro/reset (cada una manda un mail). */
async function accountRequestLimited(): Promise<string | null> {
  const key = accountRequestIpKey(await getClientIp());
  const remaining = await rateLimitRemainingMs(key, ACCOUNT_REQUEST_IP_RULE);
  if (remaining > 0) return rateLimitMessage(remaining);
  await recordRateLimitHit(key, ACCOUNT_REQUEST_IP_RULE);
  return null;
}

function isNextRedirect(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export type AuthFormState = {
  errors?: {
    name?: string[];
    email?: string[];
    password?: string[];
    confirmPassword?: string[];
    token?: string[];
  };
  message?: string;
  success?: boolean;
  pendingActivation?: boolean;
};

export async function register(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState | undefined> {
  if (!isDatabaseConfigured()) {
    return {
      message:
        "Falta DATABASE_URL en .env. Configurá PostgreSQL y reiniciá el servidor.",
    };
  }

  if (!isSmtpConfigured()) {
    return {
      message:
        "El registro no está disponible: falta configurar SMTP en el servidor.",
    };
  }

  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  };

  const parsed = RegisterSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.emailVerifiedAt) {
    return { message: "Ese mail ya ha sido utilizado por otro usuario." };
  }
  // Solicitud pendiente todavía vigente: no se pisa (evita que un tercero cambie la
  // contraseña de un registro ajeno). Si ya venció, se permite volver a registrarse.
  if (
    existing &&
    existing.verificationTokenExpiresAt &&
    existing.verificationTokenExpiresAt >= new Date()
  ) {
    return {
      message:
        "Ya hay una solicitud de registro pendiente para este email. Pedile el código de activación al administrador.",
    };
  }

  const limited = await accountRequestLimited();
  if (limited) return { message: limited };

  const token = generateVerificationToken();
  const tokenHash = hashVerificationToken(token);
  const expiresAt = verificationTokenExpiresAt();
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  try {
    await sendRegistrationApprovalEmail({
      userName: parsed.data.name,
      userEmail: email,
      token,
      expiresAt,
    });
  } catch (e) {
    console.error("register: failed to send approval email", e);
    return {
      message:
        "No pudimos enviar la solicitud de registro. Probá más tarde o contactá al administrador.",
    };
  }

  if (existing) {
    // Registro previo sin activar y con el código vencido: se renueva la solicitud.
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name,
        passwordHash,
        verificationTokenHash: tokenHash,
        verificationTokenExpiresAt: expiresAt,
      },
    });
  } else {
    await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
        emailVerifiedAt: null,
        verificationTokenHash: tokenHash,
        verificationTokenExpiresAt: expiresAt,
      },
    });
  }

  return {
    success: true,
    message:
      "Solicitud registrada. Un administrador te dará el código de activación. Tenés 12 horas para activarla.",
  };
}

export async function verifyRegistration(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState | undefined> {
  if (!isDatabaseConfigured()) {
    return {
      message:
        "Falta DATABASE_URL en .env. Configurá PostgreSQL y reiniciá el servidor.",
    };
  }

  const raw = {
    email: formData.get("email"),
    token: formData.get("token"),
  };

  const parsed = VerifyRegistrationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return { message: "Código o email incorrectos." };
  }

  if (user.emailVerifiedAt) {
    return {
      message: "Esta cuenta ya está activada. Podés iniciar sesión.",
    };
  }

  if (
    !user.verificationTokenHash ||
    !user.verificationTokenExpiresAt ||
    user.verificationTokenExpiresAt < new Date()
  ) {
    return {
      message:
        "El código expiró o no es válido. Registrate de nuevo para obtener uno nuevo.",
    };
  }

  if (!verificationTokensMatch(user.verificationTokenHash, parsed.data.token)) {
    return { message: "Código o email incorrectos." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
    },
  });

  redirect("/iniciar-sesion?activada=1");
}

export async function login(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState | undefined> {
  if (!isDatabaseConfigured()) {
    return {
      message:
        "Falta DATABASE_URL en .env. Configurá PostgreSQL y reiniciá el servidor.",
    };
  }

  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const email = parsed.data.email.toLowerCase();
  const ipKey = loginIpKey(await getClientIp());
  const [emailRemaining, ipRemaining] = await Promise.all([
    rateLimitRemainingMs(loginEmailKey(email), LOGIN_EMAIL_RULE),
    rateLimitRemainingMs(ipKey, LOGIN_IP_RULE),
  ]);
  const blockedMs = Math.max(emailRemaining, ipRemaining);
  if (blockedMs > 0) {
    return { message: rateLimitMessage(blockedMs) };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (user?.passwordHash) {
    const passwordOk = await bcrypt.compare(
      parsed.data.password,
      user.passwordHash,
    );
    if (passwordOk && !user.emailVerifiedAt) {
      return {
        message:
          "Tu cuenta aún no está activada. Ingresá el código de activación.",
        pendingActivation: true,
      };
    }
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
    });
  } catch (e) {
    if (isNextRedirect(e)) throw e;
    // Los fallos (por email y por IP) los registra authorize(); acá solo se informa.
    return { message: "Email o contraseña incorrectos." };
  }
  return undefined;
}

export async function requestPasswordReset(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState | undefined> {
  if (!isDatabaseConfigured()) {
    return {
      message:
        "Falta DATABASE_URL en .env. Configurá PostgreSQL y reiniciá el servidor.",
    };
  }

  if (!isSmtpConfigured()) {
    return {
      message:
        "El restablecimiento no está disponible: falta configurar SMTP en el servidor.",
    };
  }

  const raw = { email: formData.get("email") };
  const parsed = RequestPasswordResetSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const limited = await accountRequestLimited();
  if (limited) return { message: limited };

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  const eligible =
    user?.emailVerifiedAt && user.passwordHash;

  if (eligible) {
    const token = generateVerificationToken();
    const tokenHash = hashVerificationToken(token);
    const expiresAt = passwordResetTokenExpiresAt();

    try {
      await sendPasswordResetApprovalEmail({
        userName: user.name,
        userEmail: email,
        token,
        expiresAt,
      });
    } catch (e) {
      console.error("requestPasswordReset: failed to send approval email", e);
      return {
        message:
          "No pudimos enviar la solicitud. Probá más tarde o contactá al administrador.",
      };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetTokenExpiresAt: expiresAt,
      },
    });
  }

  return {
    success: true,
    message: PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE,
  };
}

export async function resetPassword(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState | undefined> {
  if (!isDatabaseConfigured()) {
    return {
      message:
        "Falta DATABASE_URL en .env. Configurá PostgreSQL y reiniciá el servidor.",
    };
  }

  const raw = {
    email: formData.get("email"),
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  };

  const parsed = ResetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return { message: "Código o email incorrectos." };
  }

  if (!user.emailVerifiedAt || !user.passwordHash) {
    return { message: "Código o email incorrectos." };
  }

  if (
    !user.passwordResetTokenHash ||
    !user.passwordResetTokenExpiresAt ||
    user.passwordResetTokenExpiresAt < new Date()
  ) {
    return {
      message:
        "El código expiró o no es válido. Solicitá uno nuevo para restablecer tu contraseña.",
    };
  }

  if (!verificationTokensMatch(user.passwordResetTokenHash, parsed.data.token)) {
    return { message: "Código o email incorrectos." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
    },
  });

  redirect("/iniciar-sesion?contrasena=1");
}

export async function logout() {
  await signOut({ redirectTo: "/" });
}
