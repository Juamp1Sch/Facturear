/** Largo máximo razonable para una letra de comprobante (A, B, C, M, E, R, X…). */
const MAX_LETRA_LENGTH = 5;

const PRESUPUESTO_LETRA_PATTERN = /^[A-Z]+$/;

/** Normaliza la letra ingresada: sin espacios y en mayúsculas. "" → null (limpiar). */
export function normalizePresupuestoLetra(
  value: string | null | undefined,
): string | null {
  const v = value?.trim().toUpperCase();
  return v ? v.slice(0, MAX_LETRA_LENGTH) : null;
}

export type PresupuestoLetraValidation =
  | { ok: true; letra: string | null }
  | { ok: false; error: string };

/** Valida y normaliza la letra para persistir. Vacío → null (limpiar). */
export function validatePresupuestoLetra(
  value: string | null | undefined,
): PresupuestoLetraValidation {
  const letra = normalizePresupuestoLetra(value);
  if (letra === null) return { ok: true, letra: null };
  if (!PRESUPUESTO_LETRA_PATTERN.test(letra)) {
    return {
      ok: false,
      error: "La letra solo puede contener caracteres de la A a la Z.",
    };
  }
  return { ok: true, letra };
}
