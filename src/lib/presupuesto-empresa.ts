/** Largo máximo razonable para un número de empresa. */
const MAX_EMPRESA_LENGTH = 10;

const PRESUPUESTO_EMPRESA_PATTERN = /^[0-9]+$/;

/** Normaliza la empresa ingresada: sin espacios. "" → null (limpiar). */
export function normalizePresupuestoEmpresa(
  value: string | null | undefined,
): string | null {
  const v = value?.trim();
  return v ? v.slice(0, MAX_EMPRESA_LENGTH) : null;
}

export type PresupuestoEmpresaValidation =
  | { ok: true; empresa: string | null }
  | { ok: false; error: string };

/** Valida y normaliza la empresa para persistir. Vacío → null (limpiar). */
export function validatePresupuestoEmpresa(
  value: string | null | undefined,
): PresupuestoEmpresaValidation {
  const empresa = normalizePresupuestoEmpresa(value);
  if (empresa === null) return { ok: true, empresa: null };
  if (!PRESUPUESTO_EMPRESA_PATTERN.test(empresa)) {
    return {
      ok: false,
      error: "La empresa solo puede contener números.",
    };
  }
  return { ok: true, empresa };
}
