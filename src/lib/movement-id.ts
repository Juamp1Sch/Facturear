import { randomBytes } from "crypto";

/** Alfabeto sin caracteres ambiguos (0/O, 1/I/L). */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomSuffix(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

function formatYyyyMmDd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * ID de movimiento único: YYYYMMDD + AGILE + sufijo aleatorio (5 chars).
 * @param date Fecha de la factura; si es null, usa la fecha actual.
 */
export function buildMovementId(date: Date | null): string {
  const base = formatYyyyMmDd(date ?? new Date());
  return `${base}AGILE${randomSuffix(5)}`;
}
