import { levenshtein } from "@/lib/extraction-v2/maestro-cuit";
import type { InvoiceExtractionV2Like } from "@/lib/extraction-v2/prompt";
import type { VerifiedField } from "@/lib/extraction-v2/review";
import type { ReviewIssue } from "@/lib/extraction-v2/validate";
import { normalizeNumeroComprobanteFromAiOrNull } from "@/lib/numero-comprobante";

/**
 * Cruce de la lectura del modelo con el texto de un OCR independiente (Textract) en los campos
 * donde un dígito corrido no lo detecta ninguna otra validación: CAE, número y fecha.
 *
 * Regla: si el OCR leyó ese tipo de dato y NINGUNA de sus lecturas coincide con la del modelo,
 * se marca "Revisar" (con la lectura del OCR más parecida como sugerencia). Si el OCR no lo leyó,
 * no se marca nada. Los campos que ya trae exactos el QR/ITF no se cruzan.
 */

type OcrCandidates = { auth: Set<string>; number: Set<string>; date: Set<string> };

/** Dentro de tokens mayormente numéricos, letras que el OCR confunde con dígitos. */
function fixDigitLookalikes(text: string): string {
  return text.replace(/[0-9OoIlSB|]{4,}/g, (token) => {
    const digits = token.replace(/\D/g, "").length;
    return digits > 0 && digits >= token.length * 0.6
      ? token.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/S/g, "5").replace(/B/g, "8")
      : token;
  });
}

export function ocrCandidates(text: string): OcrCandidates {
  const t = fixDigitLookalikes(text);
  const auth = new Set<string>();
  const number = new Set<string>();
  const date = new Set<string>();
  // CAE/CAEA/CAI: 14 dígitos, a veces con espacios o guiones que mete el OCR.
  for (const m of t.matchAll(/\d[\d \-.]{12,20}\d/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length === 14) auth.add(digits);
  }
  for (const m of t.matchAll(/(?<!\d)\d{14}(?!\d)/g)) auth.add(m[0]);
  // Número de comprobante con punto de venta: PV (4-5 dígitos) - número (8 dígitos).
  for (const m of t.matchAll(/(?<!\d)(\d{4,5})\s*[-–—]\s*(\d{8})(?!\d)/g)) {
    number.add(`${Number(m[1])}-${Number(m[2])}`);
  }
  // Fechas dd/mm/aaaa (o aa), con / - o . como separador.
  for (const m of t.matchAll(/(?<!\d)(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})(?!\d)/g)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2099) {
      date.add(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }
  return { auth, number, date };
}

function closest(value: string, options: Set<string>): string {
  return [...options].sort((a, b) => levenshtein(value, a) - levenshtein(value, b))[0]!;
}

const formatNumber = (key: string) => {
  const [pv, n] = key.split("-");
  return `${pv!.padStart(5, "0")}-${n!.padStart(8, "0")}`;
};
const formatDate = (iso: string) => iso.split("-").reverse().join("/");

export function crossCheckWithOcr(
  e: InvoiceExtractionV2Like,
  ocrText: string | null,
  verifiedFields: readonly VerifiedField[] = [],
): ReviewIssue[] {
  if (!ocrText?.trim()) return [];
  const c = ocrCandidates(ocrText);
  const issues: ReviewIssue[] = [];

  const auth = (e.fiscal_auth_code ?? "").replace(/\D/g, "");
  if (!verifiedFields.includes("fiscal_auth") && auth.length === 14 && c.auth.size > 0 && !c.auth.has(auth)) {
    const label = e.fiscal_auth_type ?? "CAE";
    issues.push({
      field: "fiscal_auth",
      reason: `El OCR leyó otro ${label} en el comprobante (${closest(auth, c.auth)}): revisá cuál es el correcto.`,
    });
  }

  const printed = normalizeNumeroComprobanteFromAiOrNull(e.invoice_number);
  const m = printed ? /^(\d+)-(\d+)$/.exec(printed) : null;
  const numberKey = m ? `${Number(m[1])}-${Number(m[2])}` : null;
  if (!verifiedFields.includes("invoice_number") && numberKey && c.number.size > 0 && !c.number.has(numberKey)) {
    issues.push({
      field: "invoice_number",
      reason: `El OCR leyó otro número de comprobante (${formatNumber(closest(numberKey, c.number))}): revisá cuál es el correcto.`,
    });
  }

  if (!verifiedFields.includes("invoice_date") && e.invoice_date && c.date.size > 0 && !c.date.has(e.invoice_date)) {
    issues.push({
      field: "invoice_date",
      reason: `El OCR no encontró la fecha ${formatDate(e.invoice_date)} en el comprobante (leyó ${formatDate(closest(e.invoice_date, c.date))}): revisala.`,
    });
  }
  return issues;
}
