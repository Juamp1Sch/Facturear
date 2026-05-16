import { prisma } from "@/lib/db";
import type { ResolvedChartAccount } from "@/lib/chart-account-match";

export async function resolveChartAccountForSupplierCode(
  userId: string,
  supplierCode: string | null | undefined,
): Promise<ResolvedChartAccount | null> {
  if (!supplierCode?.trim()) return null;

  const link = await prisma.supplierChartAccountLink.findFirst({
    where: {
      userId,
      supplier: { code: supplierCode.trim() },
      chartAccount: { active: true },
    },
    select: {
      chartAccount: {
        select: { id: true, code: true, name: true, type: true },
      },
    },
  });

  return link?.chartAccount ?? null;
}

export async function resolveChartAccountForSupplierId(
  userId: string,
  supplierId: string | null | undefined,
): Promise<ResolvedChartAccount | null> {
  if (!supplierId?.trim()) return null;

  const link = await prisma.supplierChartAccountLink.findFirst({
    where: {
      userId,
      supplierId: supplierId.trim(),
      chartAccount: { active: true },
    },
    select: {
      chartAccount: {
        select: { id: true, code: true, name: true, type: true },
      },
    },
  });

  return link?.chartAccount ?? null;
}
