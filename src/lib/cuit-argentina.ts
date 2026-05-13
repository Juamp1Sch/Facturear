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
 * Devuelve CUIT en XX-XXXXXXXX-X si hay exactamente 11 dígitos y el verificador
 * es coherente; si no, null (evita guardar valores mezclados tipo 13 dígitos).
 */
export function normalizeArgentineCuitOrNull(
  input: string | null | undefined,
): string | null {
  const d = cuitDigitsOnly(input);
  if (!d || d.length !== 11) return null;
  if (!cuitCheckDigitOk(d)) return null;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}
