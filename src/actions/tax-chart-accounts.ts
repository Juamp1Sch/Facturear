"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/lib/database-config";
import { prisma } from "@/lib/db";

export type TaxAssociationFormData = {
  accounts: { id: string; code: string; name: string; type: string | null }[];
  vatChartAccountId: string | null;
  perceptionChartAccountIds: string[];
  bonificacionChartAccountId: string | null;
};

export async function getTaxChartAssociationFormData(): Promise<TaxAssociationFormData> {
  if (!isDatabaseConfigured()) {
    return {
      accounts: [],
      vatChartAccountId: null,
      perceptionChartAccountIds: [],
      bonificacionChartAccountId: null,
    };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }
  const userId = session.user.id;

  const [accounts, settings, perceptionLinks] = await Promise.all([
    prisma.chartAccount.findMany({
      where: { userId, active: true },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
    }),
    prisma.taxChartAccountSettings.findUnique({
      where: { userId },
      select: {
        vatChartAccountId: true,
        bonificacionChartAccountId: true,
      },
    }),
    prisma.taxChartAccountPerceptionLink.findMany({
      where: { userId },
      orderBy: { chartAccount: { code: "asc" } },
      select: { chartAccountId: true },
    }),
  ]);

  return {
    accounts,
    vatChartAccountId: settings?.vatChartAccountId ?? null,
    perceptionChartAccountIds: perceptionLinks.map((l) => l.chartAccountId),
    bonificacionChartAccountId: settings?.bonificacionChartAccountId ?? null,
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
  const bonificacionChartAccountId = String(
    formData.get("bonificacionChartAccountId") ?? "",
  ).trim();

  const perceptionIdsRaw = formData
    .getAll("perceptionsChartAccountIds")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const perceptionIds = [...new Set(perceptionIdsRaw)];

  if (vatChartAccountId) {
    const vatAccount = await prisma.chartAccount.findFirst({
      where: { id: vatChartAccountId, userId, active: true },
      select: { id: true },
    });
    if (!vatAccount) {
      return { ok: false, error: "La cuenta de impuestos (IVA) no es válida." };
    }
  }

  if (bonificacionChartAccountId) {
    const bonificacionAccount = await prisma.chartAccount.findFirst({
      where: { id: bonificacionChartAccountId, userId, active: true },
      select: { id: true },
    });
    if (!bonificacionAccount) {
      return { ok: false, error: "La cuenta de bonificación no es válida." };
    }
  }

  if (perceptionIds.length > 0) {
    const found = await prisma.chartAccount.findMany({
      where: { userId, active: true, id: { in: perceptionIds } },
      select: { id: true },
    });
    if (found.length !== perceptionIds.length) {
      return { ok: false, error: "Una o más cuentas de percepciones no son válidas." };
    }
  }

  const vatId = vatChartAccountId || null;
  const bonificacionId = bonificacionChartAccountId || null;

  await prisma.$transaction(async (tx) => {
    await tx.taxChartAccountPerceptionLink.deleteMany({ where: { userId } });
    if (perceptionIds.length > 0) {
      await tx.taxChartAccountPerceptionLink.createMany({
        data: perceptionIds.map((chartAccountId) => ({ userId, chartAccountId })),
      });
    }

    if (!vatId && perceptionIds.length === 0 && !bonificacionId) {
      await tx.taxChartAccountSettings.deleteMany({ where: { userId } });
    } else {
      await tx.taxChartAccountSettings.upsert({
        where: { userId },
        create: {
          userId,
          vatChartAccountId: vatId,
          bonificacionChartAccountId: bonificacionId,
        },
        update: {
          vatChartAccountId: vatId,
          bonificacionChartAccountId: bonificacionId,
        },
      });
    }
  });

  revalidatePath("/cuentas/asociar-impuestos");
  revalidatePath("/cuentas");
  revalidatePath("/history");
  revalidatePath("/upload");

  return { ok: true };
}
