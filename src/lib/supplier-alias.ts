import { prisma } from "@/lib/db";
import { normalizeNameKey } from "@/lib/supplier-match";

/**
 * Alias aprendidos para asociar presupuestos (sin CUIT) al proveedor del
 * maestro por el nombre del membrete, incluso cuando viene abreviado.
 * El "valor único y fijo" es la clave normalizada del nombre detectado.
 */

export function buildAliasKey(name: string | null | undefined): string | null {
  const key = normalizeNameKey(name);
  return key.length > 0 ? key : null;
}

/** Devuelve el código de proveedor asociado a un nombre detectado, o null. */
export async function findSupplierCodeByAlias(
  userId: string,
  name: string | null | undefined,
): Promise<string | null> {
  const aliasKey = buildAliasKey(name);
  if (!aliasKey) return null;
  const row = await prisma.supplierAlias.findUnique({
    where: { userId_aliasKey: { userId, aliasKey } },
    select: { supplierCode: true },
  });
  return row?.supplierCode ?? null;
}

/**
 * Aprende/actualiza el alias nombre→proveedor. Se llama cuando se resuelve o el
 * usuario corrige el proveedor de un documento, para que futuros escaneos con
 * esa misma abreviatura matcheen automáticamente. No falla si no hay datos.
 */
export async function rememberSupplierAlias(
  userId: string,
  name: string | null | undefined,
  supplierCode: string | null | undefined,
): Promise<void> {
  const aliasKey = buildAliasKey(name);
  const code = supplierCode?.trim();
  if (!aliasKey || !code) return;
  try {
    await prisma.supplierAlias.upsert({
      where: { userId_aliasKey: { userId, aliasKey } },
      update: { supplierCode: code },
      create: { userId, aliasKey, supplierCode: code },
    });
  } catch {
    // El alias es una optimización; nunca debe romper la carga de la factura.
  }
}
