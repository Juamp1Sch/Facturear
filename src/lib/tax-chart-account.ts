import { prisma } from "@/lib/db";

export type ResolvedTaxChartAccounts = {
  vatAccountCode: string | null;
  perceptionIvaAccountCode: string | null;
  perceptionIibbAccountCode: string | null;
  bonificacionAccountCode: string | null;
  ignoreBonificaciones: boolean;
};

export async function resolveTaxChartAccountsForUser(
  userId: string,
): Promise<ResolvedTaxChartAccounts> {
  const settings = await prisma.taxChartAccountSettings.findUnique({
    where: { userId },
    select: {
      ignoreBonificaciones: true,
      vatChartAccount: { select: { code: true, active: true } },
      bonificacionChartAccount: { select: { code: true, active: true } },
      perceptionIvaChartAccount: { select: { code: true, active: true } },
      perceptionIibbChartAccount: { select: { code: true, active: true } },
    },
  });

  const activeCode = (
    account: { code: string; active: boolean } | null | undefined,
  ): string | null => (account?.active === true ? account.code : null);

  return {
    vatAccountCode: activeCode(settings?.vatChartAccount),
    perceptionIvaAccountCode: activeCode(settings?.perceptionIvaChartAccount),
    perceptionIibbAccountCode: activeCode(settings?.perceptionIibbChartAccount),
    bonificacionAccountCode: activeCode(settings?.bonificacionChartAccount),
    ignoreBonificaciones: settings?.ignoreBonificaciones ?? false,
  };
}
