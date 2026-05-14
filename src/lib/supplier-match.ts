import { cuitDigitsOnly, normalizeArgentineCuitFromAiOrNull } from "@/lib/cuit-argentina";
import { prisma } from "@/lib/db";

function compactCompanyName(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "");
}

const MIN_NAME_PREFIX_LEN = 6;

export type MaestroSupplierPick = {
  code: string;
  cuit: string | null;
};

export type MaestroSupplierRow = {
  code: string;
  name: string;
  cuit: string | null;
};

/**
 * Misma regla que al procesar la factura: CUIT igual al leído, o nombre del maestro como prefijo
 * del emisor en la factura. Si CUIT y nombre apuntan a distintos códigos, prevalece el match por nombre.
 */
export function matchSupplierFromList(
  suppliers: ReadonlyArray<MaestroSupplierRow>,
  invoiceProviderName: string | null | undefined,
  extractedCuitRaw: string | null | undefined,
): MaestroSupplierPick | null {
  if (suppliers.length === 0) return null;

  const invoiceNameC = compactCompanyName(invoiceProviderName);

  const aiCuitNorm = normalizeArgentineCuitFromAiOrNull(extractedCuitRaw ?? null);
  const aiDigits = cuitDigitsOnly(aiCuitNorm);

  let byCuit: MaestroSupplierPick | null = null;
  if (aiDigits?.length === 11) {
    for (const s of suppliers) {
      if (!s.cuit) continue;
      const rowDigits = cuitDigitsOnly(s.cuit);
      if (rowDigits === aiDigits) {
        byCuit = { code: s.code, cuit: s.cuit };
        break;
      }
    }
  }

  let byName: (MaestroSupplierPick & { prefixLen: number }) | null = null;
  if (invoiceNameC.length > 0) {
    for (const s of suppliers) {
      const masterC = compactCompanyName(s.name);
      if (masterC.length < MIN_NAME_PREFIX_LEN) continue;
      if (invoiceNameC.startsWith(masterC)) {
        if (!byName || masterC.length > byName.prefixLen) {
          byName = { code: s.code, cuit: s.cuit, prefixLen: masterC.length };
        }
      }
    }
  }

  let chosen: MaestroSupplierPick | null = null;
  if (byCuit && byName && byCuit.code !== byName.code) {
    chosen = { code: byName.code, cuit: byName.cuit };
  } else if (byCuit) {
    chosen = byCuit;
  } else if (byName) {
    chosen = { code: byName.code, cuit: byName.cuit };
  }
  return chosen;
}

export async function resolveSupplierFromMaestro(
  userId: string,
  invoiceProviderName: string | null | undefined,
  extractedCuitRaw: string | null | undefined,
): Promise<MaestroSupplierPick | null> {
  const suppliers = await prisma.supplier.findMany({
    where: { userId },
    select: { code: true, name: true, cuit: true },
  });
  return matchSupplierFromList(suppliers, invoiceProviderName, extractedCuitRaw);
}
