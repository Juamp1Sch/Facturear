import { reconcileAmounts } from "@/lib/amount-reconcile";
import type { FinalizedAmounts } from "@/lib/extraction-amounts";
import type { InvoiceExtraction } from "@/lib/schemas";

type WithOtherTaxes = InvoiceExtraction & { other_taxes_amount?: number | null };

/** Otros tributos (impuestos internos, ITC) leídos por v2; 0 si no hay. */
export function otherTaxesOf(e: InvoiceExtraction): number {
  const v = (e as WithOtherTaxes).other_taxes_amount;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Importes de v2 TAL COMO SE LEYERON (con los datos del QR ya aplicados), sin la reconciliación
 * algebraica del pipeline legacy (`finalizeExtractedAmounts`).
 *
 * Esa reconciliación "cierra" la suma despejando percepciones o neto (percepciones = total −
 * neto − IVA). Con un total exacto del QR y un desglose mal leído, inventaba percepciones que se
 * exportaban al ERP como PIV/PIB y dejaba la suma cerrada, borrando la marca "Revisar". En v2 la
 * lectura se corrige con validación + 2da pasada; lo que no cierre queda marcado, nunca se
 * completa en silencio.
 */
export function amountsAsRead(e: InvoiceExtraction): FinalizedAmounts {
  const other = otherTaxesOf(e);
  // `amounts_reconciled` / `amounts_discrepancy` se siguen guardando por compatibilidad: se
  // calculan sobre el total SIN otros tributos, que no son parte de neto + IVA + percepciones.
  const reconcile = reconcileAmounts({
    net: e.net_amount,
    vat: e.vat_amount,
    perceptions: e.perceptions_amount,
    total: e.total_amount != null ? Math.round((e.total_amount - other) * 100) / 100 : null,
  });
  return {
    netAmount: e.net_amount,
    vatAmount: e.vat_amount,
    perceptionsAmount: e.perceptions_amount,
    totalAmount: e.total_amount,
    amountsReconciled: reconcile.reconciled,
    amountsDiscrepancy: reconcile.reconciled ? null : reconcile.discrepancy,
    amountsAlgebraicallyDerived: false,
    correctedField: null,
    extracted: e,
  };
}
