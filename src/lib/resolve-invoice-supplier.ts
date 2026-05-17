import { normalizeArgentineCuitFromAiOrNull } from "@/lib/cuit-argentina";
import { ensureSupplierFromInvoice } from "@/lib/ensure-supplier-from-invoice";
import { resolveSupplierFromMaestro, type MaestroSupplierPick } from "@/lib/supplier-match";
import { findSupplierCodeForUserCuit } from "@/lib/supplier-sync";
import { prisma } from "@/lib/db";

/**
 * Resuelve el proveedor del maestro para una factura; si no existe, lo crea con nombre y CUIT leídos.
 */
export async function resolveOrCreateInvoiceSupplier(
  userId: string,
  providerName: string | null | undefined,
  extractedCuitRaw: string | null | undefined,
): Promise<MaestroSupplierPick | null> {
  const resolved = await resolveSupplierFromMaestro(userId, providerName, extractedCuitRaw);
  if (resolved) return resolved;

  const aiCuit = normalizeArgentineCuitFromAiOrNull(extractedCuitRaw);
  const codeFromCuit = await findSupplierCodeForUserCuit(userId, aiCuit);
  if (codeFromCuit) {
    const row = await prisma.supplier.findFirst({
      where: { userId, code: codeFromCuit },
      select: { code: true, cuit: true },
    });
    if (row) return { code: row.code, cuit: row.cuit };
  }

  return ensureSupplierFromInvoice(userId, providerName, aiCuit);
}
