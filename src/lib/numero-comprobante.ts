/**
 * Número de comprobante AFIP: punto de venta (5 dígitos) + número (8 dígitos),
 * formato NNNNN-NNNNNNNN (ej. 00004-00059991).
 */

const TWO_PART_PATTERN = /^(\d+)\s*[-/]\s*(\d+)$/;

/**
 * Normaliza el número devuelto por la IA o ingresado manualmente.
 * Si hay dos grupos numéricos separados por - o /, aplica padding 5-8.
 * Si es un solo bloque, devuelve el valor trimmeado sin forzar formato.
 */
export function normalizeNumeroComprobanteFromAiOrNull(
  input: string | null | undefined,
): string | null {
  const trimmed = typeof input === "string" ? input.trim() : "";
  if (!trimmed) return null;

  const match = trimmed.match(TWO_PART_PATTERN);
  if (match) {
    const pv = match[1];
    const nro = match[2];
    return `${pv.padStart(5, "0")}-${nro.padStart(8, "0")}`;
  }

  return trimmed;
}
