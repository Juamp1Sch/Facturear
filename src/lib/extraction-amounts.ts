import {
  supplementAmountsFromImages,
  supplementDiscountFromImages,
} from "@/lib/ai";
import {
  cropDiscountHeuristicRegions,
  cropDiscountRegions,
  cropTotalsRegions,
  type VisionImage,
} from "@/lib/image-preprocess";
import {
  pickBestReconcilingFields,
  reconcileAmounts,
  reanchorWithTrustedNetVat,
  tryFixPerceptionsOnly,
  vatConsistentWithNet,
  type AmountFields,
} from "@/lib/amount-reconcile";
import type { AmountsSupplement, DiscountSupplement, InvoiceExtraction } from "@/lib/schemas";
import { sumTaxLines } from "@/lib/tax-breakdown";

export type FinalizedAmounts = {
  netAmount: number | null;
  vatAmount: number | null;
  perceptionsAmount: number | null;
  totalAmount: number | null;
  amountsReconciled: boolean;
  amountsDiscrepancy: number | null;
  amountsAlgebraicallyDerived: boolean;
  correctedField: ("perceptions" | "total")[] | null;
  extracted: InvoiceExtraction;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveAmountFields(extracted: InvoiceExtraction): AmountFields {
  const vatFromLines = sumTaxLines(extracted.vat_lines);
  const perceptionsFromLines = sumTaxLines(extracted.perception_lines);
  return {
    net: extracted.net_amount,
    vat: vatFromLines ?? extracted.vat_amount,
    perceptions: perceptionsFromLines ?? extracted.perceptions_amount,
    total: extracted.total_amount,
  };
}

function resolveSupplementFields(supplement: AmountsSupplement): AmountFields {
  const vatFromLines = sumTaxLines(supplement.vat_lines);
  const perceptionsFromLines = sumTaxLines(supplement.perception_lines);
  return {
    net: supplement.net_amount,
    vat: vatFromLines ?? supplement.vat_amount,
    perceptions: perceptionsFromLines ?? supplement.perceptions_amount,
    total: supplement.total_amount,
  };
}

/**
 * Reconcilia las líneas de percepción con el total corregido, preservando las
 * etiquetas (IIBB / IVA) que definen el tipoImpuesto contable (PIB / PIV).
 * - 0 líneas → null.
 * - 1 línea → conserva el label y reajusta el monto al total corregido.
 * - >1 líneas → si la suma sigue coincidiendo, las mantiene; si no, no puede
 *   redistribuir sin perder precisión y devuelve null.
 */
function reconcilePerceptionLines(
  lines: InvoiceExtraction["perception_lines"],
  correctedPerceptions: number | null,
): InvoiceExtraction["perception_lines"] {
  const positive = lines?.filter((l) => l.amount > 0) ?? [];
  if (positive.length === 0) return null;
  if (correctedPerceptions == null || correctedPerceptions <= 0) return null;

  if (positive.length === 1) {
    return [{ ...positive[0]!, amount: correctedPerceptions }];
  }

  const sum = roundMoney(positive.reduce((acc, l) => acc + l.amount, 0));
  if (Math.abs(sum - roundMoney(correctedPerceptions)) <= 0.01) {
    return positive;
  }
  return null;
}

function applyAmountFieldsToExtraction(
  extracted: InvoiceExtraction,
  fields: AmountFields,
  options?: { clearPerceptionLines?: boolean },
): InvoiceExtraction {
  return {
    ...extracted,
    net_amount: fields.net,
    vat_amount: fields.vat,
    perceptions_amount: fields.perceptions,
    total_amount: fields.total,
    perception_lines: options?.clearPerceptionLines
      ? reconcilePerceptionLines(extracted.perception_lines, fields.perceptions)
      : extracted.perception_lines,
  };
}

function fieldsMatchRead(
  read: AmountFields,
  picked: AmountFields,
): boolean {
  return (
    (read.net == null || picked.net === read.net) &&
    (read.vat == null || picked.vat === read.vat) &&
    (read.perceptions == null || picked.perceptions === read.perceptions) &&
    (read.total == null || picked.total === read.total)
  );
}

function detectCorrectedFields(
  before: AmountFields,
  after: AmountFields,
): ("perceptions" | "total")[] {
  const corrected: ("perceptions" | "total")[] = [];
  if (
    before.perceptions != null &&
    after.perceptions != null &&
    before.perceptions !== after.perceptions
  ) {
    corrected.push("perceptions");
  }
  if (
    before.total != null &&
    after.total != null &&
    before.total !== after.total
  ) {
    corrected.push("total");
  }
  return corrected;
}

function amountsDiffer(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(roundMoney(a) - roundMoney(b)) > 0.01;
}

/**
 * Valida percepciones contra la segunda aparición (caja izquierda).
 * Si difieren, prefiere el valor que cierra con total-neto-IVA cuando neto+IVA son confiables.
 */
function applyPerceptionsCrossCheck(
  fields: AmountFields,
  supplement: AmountsSupplement | null,
  anchorNet: number | null,
  anchorVat: number | null,
): { fields: AmountFields; needsReview: boolean } {
  if (!supplement) return { fields, needsReview: false };

  const primaryPerc = supplement.perceptions_amount;
  const secondaryPerc = supplement.perceptions_amount_secondary;
  if (primaryPerc == null) return { fields, needsReview: false };

  if (
    secondaryPerc == null ||
    Math.abs(roundMoney(primaryPerc) - roundMoney(secondaryPerc)) <= 0.01
  ) {
    return { fields, needsReview: false };
  }

  const net = fields.net ?? anchorNet;
  const vat = fields.vat ?? anchorVat;
  const total = fields.total;

  if (
    net != null &&
    vat != null &&
    total != null &&
    vatConsistentWithNet(net, vat)
  ) {
    const derivedPerc = roundMoney(total - net - vat);
    const primaryCloses = Math.abs(derivedPerc - primaryPerc) <= 0.01;
    const secondaryCloses = Math.abs(derivedPerc - secondaryPerc) <= 0.01;

    if (primaryCloses && !secondaryCloses) {
      return {
        fields: { ...fields, net, vat, perceptions: primaryPerc, total },
        needsReview: true,
      };
    }
    if (secondaryCloses && !primaryCloses) {
      return {
        fields: { ...fields, net, vat, perceptions: secondaryPerc, total },
        needsReview: true,
      };
    }
  }

  return { fields, needsReview: true };
}

/** Marca revisión si extracción principal y recorte amplio discrepan sin resolución clara. */
function primarySupplementDisagreementNeedsReview(
  primary: AmountFields,
  supplement: AmountFields | null,
  resolved: AmountFields,
): boolean {
  if (!supplement) return false;

  const totalDisagrees =
    amountsDiffer(primary.total, supplement.total) &&
    amountsDiffer(resolved.total, primary.total) &&
    amountsDiffer(resolved.total, supplement.total);

  const percDisagrees =
    amountsDiffer(primary.perceptions, supplement.perceptions) &&
    amountsDiffer(resolved.perceptions, primary.perceptions) &&
    amountsDiffer(resolved.perceptions, supplement.perceptions);

  return totalDisagrees || percDisagrees;
}

/** Recorta el pie (última parte si hay varias) y relee importes con visión ampliada. */
export async function fetchAmountsSupplementCropped(
  visionImages: VisionImage[],
): Promise<AmountsSupplement | null> {
  if (visionImages.length === 0) return null;
  const croppedImages = await cropTotalsRegions(visionImages);
  return supplementAmountsFromImages(croppedImages);
}

/**
 * Recorte heurístico del bloque BONIFICACION → lee solo porcentajes → importes se calculan
 * con el neto gravado y descuentos secuenciales (más preciso que OCR de 7 dígitos).
 */
export async function fetchDiscountSupplementCropped(
  visionImages: VisionImage[],
): Promise<DiscountSupplement | null> {
  if (visionImages.length === 0) return null;

  const heuristicCrops = await cropDiscountHeuristicRegions(visionImages);
  if (heuristicCrops.length > 0) {
    const fromHeuristic = await supplementDiscountFromImages(heuristicCrops);
    if (fromHeuristic?.discount_lines?.length) return fromHeuristic;
  }

  const discountCrops = await cropDiscountRegions(visionImages);
  return supplementDiscountFromImages(discountCrops);
}

export type FinalizeExtractedAmountsOptions = {
  /** Si ya se obtuvo en paralelo con enrich fiscal, evita una 2da llamada. */
  precomputedSupplement?: AmountsSupplement | null;
};

/**
 * Valida neto+IVA+percepciones≈total. Recorta y relee SIEMPRE el pie de factura
 * con visión ampliada; ancla neto+IVA cuando son coherentes.
 */
export async function finalizeExtractedAmounts(
  extracted: InvoiceExtraction,
  visionImages?: VisionImage[],
  options?: FinalizeExtractedAmountsOptions,
): Promise<FinalizedAmounts> {
  const primaryFields = resolveAmountFields(extracted);
  let fields = primaryFields;
  let reconcile = reconcileAmounts(fields);
  let algebraicallyDerived = false;
  let correctedField: ("perceptions" | "total")[] | null = null;
  let needsReview = false;

  let supplement: AmountsSupplement | null =
    options?.precomputedSupplement ?? null;
  let supplementFields: AmountFields | null = null;

  if (!supplement && visionImages?.length) {
    supplement = await fetchAmountsSupplementCropped(visionImages);
  }
  if (supplement) {
    supplementFields = resolveSupplementFields(supplement);
  }

  const reanchored = reanchorWithTrustedNetVat(primaryFields, supplementFields);
  if (reanchored) {
    fields = reanchored;
    reconcile = reconcileAmounts(fields);
    algebraicallyDerived = true;
    correctedField = detectCorrectedFields(primaryFields, fields);
  }

  const crossCheck = applyPerceptionsCrossCheck(
    fields,
    supplement,
    primaryFields.net,
    primaryFields.vat,
  );
  if (crossCheck.needsReview) {
    needsReview = true;
  }
  if (
    crossCheck.fields.perceptions !== fields.perceptions ||
    crossCheck.fields.total !== fields.total
  ) {
    fields = crossCheck.fields;
    reconcile = reconcileAmounts(fields);
    algebraicallyDerived = true;
    correctedField = detectCorrectedFields(primaryFields, fields);
  }

  if (!reconcile.reconciled) {
    const fixedPerc = tryFixPerceptionsOnly(fields);
    if (fixedPerc) {
      fields = fixedPerc;
      reconcile = reconcileAmounts(fields);
      algebraicallyDerived = true;
      correctedField = detectCorrectedFields(primaryFields, fields);
    }
  }

  if (!reconcile.reconciled) {
    const candidateSets = [primaryFields];
    if (supplementFields) candidateSets.push(supplementFields);
    const picked = pickBestReconcilingFields(...candidateSets);
    if (picked) {
      fields = picked;
      reconcile = reconcileAmounts(fields);
      algebraicallyDerived = !fieldsMatchRead(primaryFields, picked);
      correctedField = detectCorrectedFields(primaryFields, fields);
    }
  }

  if (
    primarySupplementDisagreementNeedsReview(
      primaryFields,
      supplementFields,
      fields,
    )
  ) {
    needsReview = true;
  }

  // Solo marcar descuadre si la suma realmente no cierra (evita warning con dif. $0,00).
  reconcile = reconcileAmounts(fields);
  if (needsReview && reconcile.reconciled) {
    needsReview = false;
  }

  const current = applyAmountFieldsToExtraction(extracted, fields, {
    clearPerceptionLines: correctedField?.includes("perceptions") ?? false,
  });

  return {
    netAmount: fields.net,
    vatAmount: fields.vat,
    perceptionsAmount: fields.perceptions,
    totalAmount: fields.total,
    amountsReconciled: reconcile.reconciled,
    amountsDiscrepancy: reconcile.reconciled ? null : reconcile.discrepancy,
    amountsAlgebraicallyDerived: algebraicallyDerived,
    correctedField: correctedField?.length ? correctedField : null,
    extracted: current,
  };
}
