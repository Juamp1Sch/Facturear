"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/lib/database-config";
import { prisma } from "@/lib/db";

export type TaxAssociationFormData = {
  accounts: { id: string; code: string; name: string; type: string | null }[];
  vatChartAccountId: string | null;
  perceptionIvaChartAccountId: string | null;
  perceptionIibbChartAccountId: string | null;
  bonificacionChartAccountId: string | null;
  ignoreBonificaciones: boolean;
};

export async function getTaxChartAssociationFormData(): Promise<TaxAssociationFormData> {
  if (!isDatabaseConfigured()) {
    return {
      accounts: [],
      vatChartAccountId: null,
      perceptionIvaChartAccountId: null,
      perceptionIibbChartAccountId: null,
      bonificacionChartAccountId: null,
      ignoreBonificaciones: false,
    };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }
  const userId = session.user.id;

  const [accounts, settings] = await Promise.all([
    prisma.chartAccount.findMany({
      where: { userId, active: true },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
    }),
    prisma.taxChartAccountSettings.findUnique({
      where: { userId },
      select: {
        vatChartAccountId: true,
        perceptionIvaChartAccountId: true,
        perceptionIibbChartAccountId: true,
        bonificacionChartAccountId: true,
        ignoreBonificaciones: true,
      },
    }),
  ]);

  return {
    accounts,
    vatChartAccountId: settings?.vatChartAccountId ?? null,
    perceptionIvaChartAccountId: settings?.perceptionIvaChartAccountId ?? null,
    perceptionIibbChartAccountId: settings?.perceptionIibbChartAccountId ?? null,
    bonificacionChartAccountId: settings?.bonificacionChartAccountId ?? null,
    ignoreBonificaciones: settings?.ignoreBonificaciones ?? false,
  };
}

export type SaveTaxChartAccountsResult = { ok: true } | { ok: false; error: string };

export async function saveTaxChartAccountSettings(
  formData: FormData,
): Promise<SaveTaxChartAccountsResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Base de datos no configurada." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }
  const userId = session.user.id;

  const vatChartAccountId = String(formData.get("vatChartAccountId") ?? "").trim();
  const perceptionIvaChartAccountId = String(
    formData.get("perceptionIvaChartAccountId") ?? "",
  ).trim();
  const perceptionIibbChartAccountId = String(
    formData.get("perceptionIibbChartAccountId") ?? "",
  ).trim();
  const bonificacionChartAccountId = String(
    formData.get("bonificacionChartAccountId") ?? "",
  ).trim();
  const ignoreBonificaciones = formData.get("ignoreBonificaciones") === "on";

  // Valida que cada cuenta elegida exista, esté activa y sea del usuario.
  const validateAccount = async (id: string, label: string): Promise<string | null> => {
    if (!id) return null;
    const account = await prisma.chartAccount.findFirst({
      where: { id, userId, active: true },
      select: { id: true },
    });
    return account ? null : `La cuenta de ${label} no es válida.`;
  };

  for (const [id, label] of [
    [vatChartAccountId, "impuestos (IVA)"],
    [perceptionIvaChartAccountId, "percepción IVA"],
    [perceptionIibbChartAccountId, "percepción IIBB"],
    [bonificacionChartAccountId, "bonificación"],
  ] as const) {
    const error = await validateAccount(id, label);
    if (error) return { ok: false, error };
  }

  const vatId = vatChartAccountId || null;
  const perceptionIvaId = perceptionIvaChartAccountId || null;
  const perceptionIibbId = perceptionIibbChartAccountId || null;
  const bonificacionId = bonificacionChartAccountId || null;

  const allEmpty =
    !vatId &&
    !perceptionIvaId &&
    !perceptionIibbId &&
    !bonificacionId &&
    !ignoreBonificaciones;

  if (allEmpty) {
    await prisma.taxChartAccountSettings.deleteMany({ where: { userId } });
  } else {
    await prisma.taxChartAccountSettings.upsert({
      where: { userId },
      create: {
        userId,
        vatChartAccountId: vatId,
        perceptionIvaChartAccountId: perceptionIvaId,
        perceptionIibbChartAccountId: perceptionIibbId,
        bonificacionChartAccountId: bonificacionId,
        ignoreBonificaciones,
      },
      update: {
        vatChartAccountId: vatId,
        perceptionIvaChartAccountId: perceptionIvaId,
        perceptionIibbChartAccountId: perceptionIibbId,
        bonificacionChartAccountId: bonificacionId,
        ignoreBonificaciones,
      },
    });
  }

  revalidatePath("/cuentas/asociar-impuestos");
  revalidatePath("/cuentas");
  revalidatePath("/history");
  revalidatePath("/upload");

  return { ok: true };
}
