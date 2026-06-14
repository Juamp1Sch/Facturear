function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bi\s+v\s+a\b/g, "iva")
    .replace(/\s+/g, " ")
    .trim();
}

function hasIvaPerception(text: string): boolean {
  const n = normalizeForMatch(text);
  return n.includes("iva") && (n.includes("percepcion") || n.includes("perc"));
}

/**
 * Clasifica el tipoImpuesto contable de una percepción: PIB (IIBB) o PIV (IVA).
 * Fallback por texto cuando la IA no devuelve el `kind` explícito del renglón.
 */
export function classifyPerceptionTipoImpuesto(text: string | null): "PIB" | "PIV" {
  const normalized = normalizeForMatch(text ?? "");
  // Priorizar IVA aunque el label incluya "IIBB" de un encabezado de sección
  // (ej. bloque "PERCEPCIONES IIBB" con renglón "Perc. IVA").
  if (hasIvaPerception(normalized)) {
    return "PIV";
  }
  return "PIB";
}
