"use server";

import bcrypt from "bcryptjs";

import { signIn, signOut } from "@/auth";
import { isDatabaseConfigured } from "@/lib/database-config";
import { LoginSchema, RegisterSchema } from "@/lib/auth-schemas";
import { prisma } from "@/lib/db";

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
  };
  message?: string;
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

  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = RegisterSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { message: "Ya existe una cuenta con ese email." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash,
    },
  });

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/upload",
    });
  } catch (e) {
    if (isNextRedirect(e)) throw e;
    return {
      message:
        "Cuenta creada, pero no pudimos iniciar sesión automáticamente. Probá en Iniciar sesión.",
    };
  }
  return undefined;
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

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/upload",
    });
  } catch (e) {
    if (isNextRedirect(e)) throw e;
    return { message: "Email o contraseña incorrectos." };
  }
  return undefined;
}

export async function logout() {
  await signOut({ redirectTo: "/" });
}
