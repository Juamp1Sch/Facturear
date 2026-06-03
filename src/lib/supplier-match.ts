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

/** Palabras vacías / sufijos legales que no aportan identidad al proveedor. */
const NAME_STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "y",
  "e",
  "sa",
  "srl",
  "sas",
  "sh",
  "scs",
  "saci",
  "saic",
  "saicf",
  "ltda",
  "ltd",
  "cia",
  "co",
]);

/** Tokens normalizados (sin acentos, minúsculas, sin puntuación, sin stopwords). */
export function nameTokens(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !NAME_STOPWORDS.has(t));
}

/** Clave normalizada estable de un nombre (tokens significativos unidos por espacio). */
export function normalizeNameKey(raw: string | null | undefined): string {
  return nameTokens(raw).join(" ");
}

/** Dos tokens "matchean" si son iguales o uno es prefijo del otro (abreviatura). */
function tokensAbbrevMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 2) return false;
  return long.startsWith(short);
}

/**
 * Score de similitud 0..1 tolerante a abreviaturas entre dos nombres.
 * Requiere que el primer token significativo de ambos haga match (ancla) para
 * evitar falsos positivos, y mide cuántos tokens del nombre más corto tienen
 * correspondencia (igual o prefijo) en el más largo.
 */
export function tolerantNameScore(
  invoiceName: string | null | undefined,
  masterName: string | null | undefined,
): number {
  const inv = nameTokens(invoiceName);
  const mas = nameTokens(masterName);
  if (inv.length === 0 || mas.length === 0) return 0;

  // Ancla: el primer token debe coincidir (ej. "nigut", "jb").
  if (!tokensAbbrevMatch(inv[0]!, mas[0]!)) return 0;

  const [shortList, longList] =
    inv.length <= mas.length ? [inv, mas] : [mas, inv];
  const usedLong = new Set<number>();
  let matched = 0;
  for (const tok of shortList) {
    for (let j = 0; j < longList.length; j++) {
      if (usedLong.has(j)) continue;
      if (tokensAbbrevMatch(tok, longList[j]!)) {
        usedLong.add(j);
        matched++;
        break;
      }
    }
  }
  return matched / shortList.length;
}

/** Umbral mínimo para aceptar un match tolerante por nombre. */
const TOLERANT_NAME_MIN_SCORE = 0.75;

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
 * Para documentos sin CUIT (presupuestos) cae a un match tolerante a abreviaturas.
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
  if (chosen) return chosen;

  // Fallback tolerante a abreviaturas (sobre todo para presupuestos sin CUIT).
  let bestTolerant: (MaestroSupplierPick & { score: number }) | null = null;
  for (const s of suppliers) {
    const score = tolerantNameScore(invoiceProviderName, s.name);
    if (score < TOLERANT_NAME_MIN_SCORE) continue;
    if (!bestTolerant || score > bestTolerant.score) {
      bestTolerant = { code: s.code, cuit: s.cuit, score };
    }
  }
  if (bestTolerant) return { code: bestTolerant.code, cuit: bestTolerant.cuit };

  return null;
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
