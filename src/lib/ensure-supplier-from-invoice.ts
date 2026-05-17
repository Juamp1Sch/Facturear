import { cuitDigitsOnly } from "@/lib/cuit-argentina";
import { prisma } from "@/lib/db";
import type { MaestroSupplierPick } from "@/lib/supplier-match";

const MAX_AUTO_SUPPLIER_CODE = 99_999;

function parseAutoSupplierCodeNumber(code: string): number | null {
  if (!/^\d{1,5}$/.test(code)) return null;
  const n = Number(code);
  if (!Number.isInteger(n) || n < 0 || n > MAX_AUTO_SUPPLIER_CODE) return null;
  return n;
}

function cuitForbiddenCodes(cuit: string | null): Set<string> {
  const forbidden = new Set<string>();
  if (!cuit) return forbidden;
  const trimmed = cuit.trim();
  if (trimmed) forbidden.add(trimmed);
  const digits = cuitDigitsOnly(cuit);
  if (digits) {
    forbidden.add(digits);
    const asNumber = parseAutoSupplierCodeNumber(digits);
    if (asNumber != null) forbidden.add(String(asNumber));
  }
  return forbidden;
}

/**
 * Próximo código numérico libre (0–99999), único en el maestro y distinto del CUIT.
 */
async function allocateAutoSupplierCode(
  userId: string,
  cuit: string | null,
): Promise<string> {
  const rows = await prisma.supplier.findMany({
    where: { userId },
    select: { code: true },
  });

  const used = new Set(rows.map((r) => r.code));
  const forbidden = cuitForbiddenCodes(cuit);
  for (const code of used) forbidden.add(code);

  let start = 0;
  for (const code of used) {
    const n = parseAutoSupplierCodeNumber(code);
    if (n != null && n + 1 <= MAX_AUTO_SUPPLIER_CODE) {
      start = Math.max(start, n + 1);
    }
  }

  const tryCode = (n: number): string | null => {
    if (n < 0 || n > MAX_AUTO_SUPPLIER_CODE) return null;
    const code = String(n);
    if (forbidden.has(code)) return null;
    if (used.has(code)) return null;
    return code;
  };

  for (let n = start; n <= MAX_AUTO_SUPPLIER_CODE; n++) {
    const code = tryCode(n);
    if (code) return code;
  }
  for (let n = 0; n < start; n++) {
    const code = tryCode(n);
    if (code) return code;
  }

  throw new Error(
    "No hay códigos de proveedor disponibles (0–99999). Revisá el maestro o liberá códigos.",
  );
}

/**
 * Crea un proveedor en el maestro cuando la factura no coincide con ninguno existente.
 * Usa el CUIT y el nombre leídos en la factura.
 */
export async function ensureSupplierFromInvoice(
  userId: string,
  providerName: string | null | undefined,
  providerCuit: string | null | undefined,
): Promise<MaestroSupplierPick | null> {
  const name = providerName?.trim() ?? "";
  const cuit = providerCuit?.trim() || null;
  if (!name && !cuit) return null;

  if (cuit) {
    const existingByCuit = await prisma.supplier.findFirst({
      where: { userId, cuit },
      select: { code: true, cuit: true },
    });
    if (existingByCuit) {
      return { code: existingByCuit.code, cuit: existingByCuit.cuit };
    }
  }

  const code = await allocateAutoSupplierCode(userId, cuit);
  const supplierName = name || `Proveedor ${code}`;

  const created = await prisma.supplier.create({
    data: {
      userId,
      code,
      name: supplierName,
      cuit,
    },
    select: { code: true, cuit: true },
  });

  return { code: created.code, cuit: created.cuit };
}
