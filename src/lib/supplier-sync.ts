import { prisma } from "@/lib/db";
import { matchSupplierFromList } from "@/lib/supplier-match";

export async function findSupplierCodeForUserCuit(
  userId: string,
  providerCuit: string | null,
): Promise<string | null> {
  if (!providerCuit) return null;
  const row = await prisma.supplier.findFirst({
    where: { userId, cuit: providerCuit },
    select: { code: true },
  });
  return row?.code ?? null;
}

/** Actualiza `supplier_code` en todas las facturas del usuario según maestro (CUIT o nombre). */
export async function syncInvoiceSupplierCodesForUser(userId: string): Promise<void> {
  const suppliers = await prisma.supplier.findMany({
    where: { userId },
    select: { code: true, name: true, cuit: true },
  });
  const invoices = await prisma.invoice.findMany({
    where: { userId },
    select: { id: true, providerName: true, providerCuit: true, supplierCode: true },
  });
  for (const inv of invoices) {
    const m = matchSupplierFromList(suppliers, inv.providerName, inv.providerCuit);
    const next = m?.code ?? null;
    if (next !== inv.supplierCode) {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { supplierCode: next },
      });
    }
  }
}
