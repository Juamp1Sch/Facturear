import { reconcileAmounts } from "@/lib/amount-reconcile";
import type { FinalizedAmounts } from "@/lib/extraction-amounts";

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
