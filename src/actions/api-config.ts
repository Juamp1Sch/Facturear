"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/lib/database-config";
import { prisma } from "@/lib/db";

const SaveApiConfigSchema = z.object({
  apiUrl: z.string().trim().url("La URL debe ser válida (https://…)"),
  userToken: z.string().trim(),
});

export type ApiConfigPublic = {
  apiUrl: string;
  /** True when a token is stored (value is never sent to the client). */
  hasToken: boolean;
};

export type SaveApiConfigResult =
  | { ok: true }
  | { ok: false; error: string };

export async function getApiConfigForUser(): Promise<ApiConfigPublic | null> {
  if (!isDatabaseConfigured()) return null;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const config = await prisma.integrationConfig.findUnique({
    where: { userId: session.user.id },
    select: { apiUrl: true, userToken: true },
  });

  if (!config) return null;

  return {
    apiUrl: config.apiUrl,
    hasToken: config.userToken.length > 0,
  };
}

export async function isApiConfiguredForUser(userId: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;

  const config = await prisma.integrationConfig.findUnique({
    where: { userId },
    select: { apiUrl: true, userToken: true },
  });

  return Boolean(config?.apiUrl?.trim() && config?.userToken?.trim());
}

export async function saveApiConfig(formData: FormData): Promise<SaveApiConfigResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Falta DATABASE_URL. Configurá la base de datos primero." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const parsed = SaveApiConfigSchema.safeParse({
    apiUrl: formData.get("apiUrl"),
    userToken: formData.get("userToken"),
  });

  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      first.apiUrl?.[0] ?? first.userToken?.[0] ?? "Datos inválidos.";
    return { ok: false, error: msg };
  }

  const { apiUrl, userToken } = parsed.data;

  const existing = await prisma.integrationConfig.findUnique({
    where: { userId: session.user.id },
    select: { userToken: true },
  });

  const tokenToStore = userToken || existing?.userToken || "";
  if (!tokenToStore) {
    return { ok: false, error: "El token no puede estar vacío." };
  }

  await prisma.integrationConfig.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      provider: "EXTERNAL",
      apiUrl,
      userToken: tokenToStore,
    },
    update: {
      apiUrl,
      userToken: tokenToStore,
    },
  });

  revalidatePath("/api-config");
  revalidatePath("/history");

  return { ok: true };
}
