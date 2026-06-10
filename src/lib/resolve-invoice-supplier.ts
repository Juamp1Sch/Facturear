import { normalizeArgentineCuitFromAiOrNull } from "@/lib/cuit-argentina";
import { ensureSupplierFromInvoice } from "@/lib/ensure-supplier-from-invoice";
import { resolveSupplierFromMaestro, type MaestroSupplierPick } from "@/lib/supplier-match";
import { findSupplierCodeByAlias, rememberSupplierAlias } from "@/lib/supplier-alias";
import { findSupplierCodeForUserCuit } from "@/lib/supplier-sync";
import { prisma } from "@/lib/db";

export type MaestroSupplierDetail = MaestroSupplierPick & { name: string };

export async function pickSupplierByCode(
  userId: string,
  code: string,
): Promise<MaestroSupplierDetail | null> {
  const row = await prisma.supplier.findFirst({
    where: { userId, code },
    select: { code: true, cuit: true, name: true },
  });
  return row ? { code: row.code, cuit: row.cuit, name: row.name } : null;
}

async function pickByCode(
  userId: string,
  code: string,
): Promise<MaestroSupplierPick | null> {
  const picked = await pickSupplierByCode(userId, code);
  return picked ? { code: picked.code, cuit: picked.cuit } : null;
}

/**
 * Resuelve el proveedor del maestro para una factura o presupuesto; si no existe,
 * lo crea con nombre y CUIT leídos. Para presupuestos sin CUIT prioriza el alias
 * aprendido (nombre del membrete) y un match tolerante a abreviaturas; al
 * resolverlo, recuerda el alias para futuros escaneos.
 */
export async function resolveOrCreateInvoiceSupplier(
  userId: string,
  providerName: string | null | undefined,
  extractedCuitRaw: string | null | undefined,
): Promise<MaestroSupplierPick | null> {
  const aiCuit = normalizeArgentineCuitFromAiOrNull(extractedCuitRaw);

  // 1) Alias aprendido por nombre (valor único y fijo para presupuestos sin CUIT).
  if (!aiCuit) {
    const aliasCode = await findSupplierCodeByAlias(userId, providerName);
    if (aliasCode) {
      const picked = await pickByCode(userId, aliasCode);
      if (picked) return picked;
    }
  }

  // 2) Maestro por CUIT, prefijo exacto o nombre tolerante a abreviaturas.
  const resolved = await resolveSupplierFromMaestro(userId, providerName, extractedCuitRaw);
  if (resolved) {
    await rememberSupplierAlias(userId, providerName, resolved.code);
    return resolved;
  }

  const codeFromCuit = await findSupplierCodeForUserCuit(userId, aiCuit);
  if (codeFromCuit) {
    const picked = await pickByCode(userId, codeFromCuit);
    if (picked) return picked;
  }

  // 3) Crear proveedor nuevo con el nombre (y CUIT si lo hay) y recordar alias.
  const created = await ensureSupplierFromInvoice(userId, providerName, aiCuit);
  if (created) {
    await rememberSupplierAlias(userId, providerName, created.code);
  }
  return created;
}
