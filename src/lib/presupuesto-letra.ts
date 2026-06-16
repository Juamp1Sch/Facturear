/** Largo máximo razonable para una letra de comprobante (A, B, C, M, E, R, X…). */
const MAX_LETRA_LENGTH = 5;

/** Normaliza la letra ingresada: sin espacios y en mayúsculas. "" → null (limpiar). */
export function normalizePresupuestoLetra(
  value: string | null | undefined,
): string | null {
  const v = value?.trim().toUpperCase();
  return v ? v.slice(0, MAX_LETRA_LENGTH) : null;
}
