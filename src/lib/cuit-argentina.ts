/**
 * CUIT argentino: 11 dígitos (XX-XXXXXXXX-X). La IA a veces concatena
 * dígitos del cliente y del emisor → cadenas inválidas (≠ 11 dígitos).
 */

const CHECK_COEFF = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

function cuitCheckDigitOk(elevenDigits: string): boolean {
  let acc = 0;
  for (let i = 0; i < 10; i++) {
    acc += Number(elevenDigits[i]) * CHECK_COEFF[i];
  }
  const mod = acc % 11;
  const expected =
    mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;
  return expected === Number(elevenDigits[10]);
}

/** Solo dígitos. */
export function cuitDigitsOnly(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  const d = input.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

/**
 * Validación con mensaje para formularios. Vacío → `normalized: null`.
 * @param options.requireVerifier Si es `false`, con 11 dígitos se acepta el CUIT
 * aunque el verificador AFIP no cierre (útil si el comprobante tiene errata impresa).
 * Para persistir el `cuit` devuelto por el modelo usá `normalizeArgentineCuitFromAiOrNull`.
 */
export function validateArgentineCuitForEntry(
  input: string | null | undefined,
  options: { requireVerifier?: boolean } = {},
):
  | { ok: true; normalized: string | null }
  | { ok: false; message: string } {
  const requireVerifier = options.requireVerifier !== false;
  const trimmed = typeof input === "string" ? input.trim() : "";
  if (!trimmed) return { ok: true, normalized: null };

  const d = cuitDigitsOnly(trimmed);
  if (!d) {
    return { ok: false, message: "Ingresá números o el formato con guiones (XX-XXXXXXXX-X)." };
  }
  if (d.length !== 11) {
    const more = d.length > 11;
    return {
      ok: false,
      message: more
        ? `Este valor tiene ${d.length} dígitos; un CUIT tiene exactamente 11. Suele pasar por leer de más la cabecera o confundirlo con el CUIT del cliente en el cuerpo del documento. En el membrete del emisor suele estar solo arriba (no el del “Consumidor final”).`
        : `Este valor tiene ${d.length} dígitos; un CUIT tiene 11. Revisá la cabecera del EMISOR.`,
    };
  }
  if (requireVerifier && !cuitCheckDigitOk(d)) {
    return {
      ok: false,
      message:
        "El dígito verificador no coincide con el estándar AFIP. Revisá que sean los 11 dígitos del EMISOR en la cabecera (no el CUIT del cliente). Si coinciden con el papel y igual falla, el comprobante podría tener una cifra mal impresa.",
    };
  }
  return {
    ok: true,
    normalized: `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`,
  };
}

/**
 * Devuelve CUIT en XX-XXXXXXXX-X si hay exactamente 11 dígitos y el verificador
 * es coherente; si no, null (evita guardar valores mezclados tipo 13 dígitos).
 */
export function normalizeArgentineCuitOrNull(
  input: string | null | undefined,
): string | null {
  const r = validateArgentineCuitForEntry(input, { requireVerifier: true });
  return r.ok ? r.normalized : null;
}

/**
 * Normaliza el CUIT proveniente del modelo (OpenAI): exige 11 dígitos y formato
 * XX-XXXXXXXX-X, sin validar dígito verificador AFIP (muchos comprobantes o lecturas
 * no lo cumplen pero el valor es el del membrete).
 */
export function normalizeArgentineCuitFromAiOrNull(
  input: string | null | undefined,
): string | null {
  const r = validateArgentineCuitForEntry(input, { requireVerifier: false });
  return r.ok ? r.normalized : null;
}
