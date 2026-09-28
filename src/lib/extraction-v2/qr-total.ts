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
 * La reconciliación (finalizeExtractedAmounts) no conoce los otros tributos: con el total
 * completo "cerraría" la suma metiéndolos en percepciones (que se exportan como PIV/PIB).
 * Se reconcilia sobre el total SIN otros tributos y después se suman de vuelta.
 */
export function excludeOtherTaxes(e: InvoiceExtraction): InvoiceExtraction {
  const other = otherTaxesOf(e);
  if (!other || e.total_amount == null) return e;
  return { ...e, total_amount: Math.round((e.total_amount - other) * 100) / 100 };
}

export function restoreOtherTaxes(finalized: FinalizedAmounts, other: number): FinalizedAmounts {
  if (!other || finalized.totalAmount == null) return finalized;
  const total = Math.round((finalized.totalAmount + other) * 100) / 100;
  return { ...finalized, totalAmount: total, extracted: { ...finalized.extracted, total_amount: total } };
}

/**
 * El total del QR de ARCA es exacto: la reconciliación algebraica (finalizeExtractedAmounts)
 * no puede pisarlo. Si lo cambió, se restaura y se recalcula el estado de reconciliación; si el
 * desglose no cierra con ese total, lo que queda marcado para revisar es el desglose.
 */
export function lockQrTotal(finalized: FinalizedAmounts, qrTotal: number | null): FinalizedAmounts {
  if (qrTotal == null || finalized.totalAmount === qrTotal) return finalized;
  const reconcile = reconcileAmounts({
    net: finalized.netAmount,
    vat: finalized.vatAmount,
    perceptions: finalized.perceptionsAmount,
    total: qrTotal,
  });
  const correctedField = finalized.correctedField?.filter((f) => f !== "total") ?? null;
  return {
    ...finalized,
    totalAmount: qrTotal,
    amountsReconciled: reconcile.reconciled,
    amountsDiscrepancy: reconcile.reconciled ? null : reconcile.discrepancy,
    correctedField: correctedField?.length ? correctedField : null,
    amountsAlgebraicallyDerived: Boolean(correctedField?.length),
    extracted: { ...finalized.extracted, total_amount: qrTotal },
  };
}
