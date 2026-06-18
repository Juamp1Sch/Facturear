"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/lib/database-config";
import { prisma } from "@/lib/db";
import { validatePresupuestoEmpresa } from "@/lib/presupuesto-empresa";
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

export async function getPresupuestoEmpresa(): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { presupuestoEmpresa: true },
  });

  return user?.presupuestoEmpresa ?? null;
}

export type SavePresupuestoEmpresaResult =
  | { ok: true; empresa: string | null }
  | { ok: false; error: string };

export async function savePresupuestoEmpresa(
  formData: FormData,
): Promise<SavePresupuestoEmpresaResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Base de datos no configurada." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const validation = validatePresupuestoEmpresa(String(formData.get("empresa") ?? ""));
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { presupuestoEmpresa: validation.empresa },
  });

  revalidatePath("/cuentas/asociar-proveedores");
  revalidatePath("/upload");

  return { ok: true, empresa: validation.empresa };
}
