/**
 * Corrección determinística del CUIT del emisor contra el maestro de proveedores del usuario.
 * El modelo suele errar 1-3 dígitos del CUIT (letra chica en el membrete); si el CUIT leído no
 * está en el maestro pero hay uno muy parecido CON el mismo nombre de proveedor, se usa ese.
 *
 * Reglas (validadas contra el set de referencia, 0 correcciones indebidas):
 * - siempre exige coincidencia de nombre (el maestro tiene cientos de CUITs parecidos entre sí);
 * - nunca completa un CUIT que el modelo devolvió vacío (el maestro también puede tener errores);
 * - si hay empate entre candidatos, no corrige.
 */
export type MaestroSupplier = { cuit: string; name: string };

export type MaestroCuitMatch =
  | { status: "known" }
  | { status: "corrected"; cuit: string; supplierName: string; distance: number }
  | { status: "unknown" };

const STOPWORDS = new Set([
  "sa", "srl", "sas", "saic", "sacifi", "sacifiya", "saci", "sacif", "cia", "hijos",
  "los", "las", "del", "the",
]);

function nameTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

/** Proporción de palabras significativas compartidas (sobre el nombre más corto). */
export function supplierNameSimilarity(a: string, b: string): number {
  const A = nameTokens(a);
  const B = nameTokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / Math.min(A.size, B.size);
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const formatCuit = (d: string) => `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;

export function matchCuitAgainstMaestro(
  maestro: MaestroSupplier[],
  cuit: string | null | undefined,
  providerName: string | null | undefined,
): MaestroCuitMatch {
  const read = digits(cuit);
  if (!read) return { status: "unknown" };
  if (maestro.some((m) => digits(m.cuit) === read)) return { status: "known" };
  if (!providerName?.trim()) return { status: "unknown" };

  const candidates = maestro
    .map((m) => {
      const d = digits(m.cuit);
      return {
        m,
        d,
        distance: d.length === 11 ? levenshtein(read, d) : 99,
        similarity: supplierNameSimilarity(providerName, m.name),
      };
    })
    .filter(
      (c) =>
        (c.distance <= 2 && c.similarity >= 0.5) ||
        (c.distance <= 4 && c.similarity >= 0.99),
    )
    .sort((x, y) => x.distance - y.distance || y.similarity - x.similarity);

  const best = candidates[0];
  if (!best) return { status: "unknown" };
  const second = candidates[1];
  if (second && second.d !== best.d && second.distance === best.distance && second.similarity === best.similarity) {
    return { status: "unknown" };
  }
  return { status: "corrected", cuit: formatCuit(best.d), supplierName: best.m.name, distance: best.distance };
}
