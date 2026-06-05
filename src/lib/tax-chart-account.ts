import { prisma } from "@/lib/db";

export type PerceptionChartAccount = {
  code: string;
  name: string;
};

export type ResolvedTaxChartAccounts = {
  vatAccountCode: string | null;
  perceptionsAccounts: PerceptionChartAccount[];
  bonificacionAccountCode: string | null;
};

export async function resolveTaxChartAccountsForUser(
  userId: string,
): Promise<ResolvedTaxChartAccounts> {
  const [settings, perceptionLinks] = await Promise.all([
    prisma.taxChartAccountSettings.findUnique({
      where: { userId },
      select: {
        vatChartAccount: { select: { code: true, active: true } },
        bonificacionChartAccount: { select: { code: true, active: true } },
      },
    }),
    prisma.taxChartAccountPerceptionLink.findMany({
      where: { userId },
      orderBy: { chartAccount: { code: "asc" } },
      select: {
        chartAccount: { select: { code: true, name: true, active: true } },
      },
    }),
  ]);

  const vatAccountCode =
    settings?.vatChartAccount?.active === true
      ? settings.vatChartAccount.code
      : null;

  const bonificacionAccountCode =
    settings?.bonificacionChartAccount?.active === true
      ? settings.bonificacionChartAccount.code
      : null;

  const perceptionsAccounts = perceptionLinks
    .filter((l) => l.chartAccount.active)
    .map((l) => ({
      code: l.chartAccount.code,
      name: l.chartAccount.name,
    }));

  return {
    vatAccountCode,
    perceptionsAccounts,
    bonificacionAccountCode,
  };
}
