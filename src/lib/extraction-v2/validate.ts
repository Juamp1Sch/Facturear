import { normalizeArgentineCuitOrNull } from "@/lib/cuit-argentina";
import type { ArcaFiscalData } from "@/lib/extraction-v2/arca-codes";
import type { ReviewFieldKey } from "@/lib/extraction-v2/review";
import type { InvoiceExtraction } from "@/lib/schemas";

/** Campos que la UI puede marcar como "Revisar". */
export type ReviewField = ReviewFieldKey;

export type ReviewIssue = {
  field: ReviewField;
  /** Motivo para el usuario (se muestra al pasar el mouse sobre "Revisar"). */
  reason: string;
  /** Indicación para la 2da pasada del modelo (qué releer). */
  retryHint?: string;
};

/**
 * Estricta a propósito: solo cubre redondeos de IVA. La tolerancia del reconciliador (0,5% del
 * total) dejaría pasar un dígito mal leído en un importe de 7 cifras (ej. 1.326.690,59 vs
 * 1.325.690,59), que es justo el error típico del OCR del modelo.
 */
const TOLERANCE = 0.05;
const CAE_DIGITS = 14;
const MAX_FUTURE_DAYS = 2;

export function validateExtraction(
  e: InvoiceExtraction,
  fiscal: ArcaFiscalData | null,
  now: Date = new Date(),
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  if (e.cuit && !normalizeArgentineCuitOrNull(e.cuit)) {
    issues.push({
      field: "cuit",
      reason: `El CUIT leído (${e.cuit}) no tiene un dígito verificador válido.`,
      retryHint: `El CUIT "${e.cuit}" no pasa el dígito verificador: releé cada dígito del CUIT del EMISOR en la ampliación de la cabecera (y en el código de barras si lo hay).`,
    });
  }

  if (e.net_amount != null && e.total_amount != null) {
    const sum = e.net_amount + (e.vat_amount ?? 0) + (e.perceptions_amount ?? 0);
    if (Math.abs(sum - e.total_amount) > TOLERANCE) {
      issues.push({
        field: "amounts",
        reason:
          fiscal?.total != null
            ? `Neto + IVA + percepciones (${sum.toFixed(2)}) no coincide con el total del QR de ARCA (${e.total_amount.toFixed(2)}, exacto): revisá el desglose.`
            : `Neto + IVA + percepciones (${sum.toFixed(2)}) no coincide con el total (${e.total_amount.toFixed(2)}).`,
        retryHint: `Neto ${e.net_amount} + IVA ${e.vat_amount ?? 0} + percepciones ${e.perceptions_amount ?? 0} = ${sum.toFixed(2)}, pero el total es ${e.total_amount}. Releé los importes del recuadro de totales dígito por dígito en la ampliación del pie.`,
      });
    }
  }
  if (fiscal?.total != null && e.total_amount != null && Math.abs(fiscal.total - e.total_amount) > TOLERANCE) {
    issues.push({
      field: "amounts",
      reason: `El total leído (${e.total_amount.toFixed(2)}) no coincide con el del QR de ARCA (${fiscal.total.toFixed(2)}).`,
      retryHint: `El total leído (${e.total_amount}) no coincide con el importe del QR fiscal (${fiscal.total}). Releé el recuadro de totales.`,
    });
  }

  const authDigits = (e.fiscal_auth_code ?? "").replace(/\D/g, "");
  if ((e.fiscal_auth_type === "CAE" || e.fiscal_auth_type === "CAEA") && authDigits && authDigits.length !== CAE_DIGITS) {
    issues.push({
      field: "fiscal_auth",
      reason: `El ${e.fiscal_auth_type} leído (${e.fiscal_auth_code}) no tiene ${CAE_DIGITS} dígitos.`,
      retryHint: `El ${e.fiscal_auth_type} "${e.fiscal_auth_code}" no tiene ${CAE_DIGITS} dígitos: releelo en la ampliación del pie (y comparalo con el código de barras si lo hay).`,
    });
  }

  if (e.invoice_date) {
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(e.invoice_date) && !Number.isNaN(Date.parse(`${e.invoice_date}T00:00:00Z`));
    if (!valid) {
      issues.push({
        field: "invoice_date",
        reason: `La fecha leída (${e.invoice_date}) no es válida.`,
        retryHint: `La fecha "${e.invoice_date}" no es una fecha válida en formato YYYY-MM-DD.`,
      });
    } else if (Date.parse(`${e.invoice_date}T00:00:00Z`) - now.getTime() > MAX_FUTURE_DAYS * 86_400_000) {
      issues.push({
        field: "invoice_date",
        reason: `La fecha leída (${e.invoice_date}) está en el futuro.`,
        retryHint: `La fecha "${e.invoice_date}" está en el futuro: releé el recuadro de fecha (el vencimiento del CAE suele ser la emisión + 10 días).`,
      });
    }
  }

  return issues;
}
