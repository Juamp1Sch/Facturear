"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/lib/database-config";
import { prisma } from "@/lib/db";
import { validatePresupuestoLetra } from "@/lib/presupuesto-letra";

export async function getPresupuestoLetra(): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { presupuestoLetra: true },
  });

  return user?.presupuestoLetra ?? null;
}

export type SavePresupuestoLetraResult =
  | { ok: true; letra: string | null }
  | { ok: false; error: string };

export async function savePresupuestoLetra(
  formData: FormData,
): Promise<SavePresupuestoLetraResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Base de datos no configurada." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const validation = validatePresupuestoLetra(String(formData.get("letra") ?? ""));
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { presupuestoLetra: validation.letra },
  });

  revalidatePath("/cuentas/asociar-proveedores");
  revalidatePath("/upload");

  return { ok: true, letra: validation.letra };
}
