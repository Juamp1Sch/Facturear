/**
 * Resultado de verificación de la extracción v2, guardado en `aiPayload.review`.
 * Sin dependencias de servidor: lo lee la UI para marcar campos "Revisar".
 */
export type ReviewFieldKey =
  | "cuit"
  | "invoice_date"
  | "amounts"
  | "fiscal_auth"
  | "extraction";

export type ExtractionReview = {
  version: 2;
  /** Campo → motivo por el que conviene revisarlo. */
  fields: Partial<Record<ReviewFieldKey, string>>;
  /** Si CUIT/fecha/número/total/CAE salieron del QR o código de barras de ARCA (exactos). */
  verifiedBy: "QR" | "ITF" | null;
  /** CUIT corregido contra el maestro de proveedores. */
  cuitCorrection?: { from: string | null; to: string; supplierName: string };
};

export function readExtractionReview(aiPayload: unknown): ExtractionReview | null {
  if (!aiPayload || typeof aiPayload !== "object" || Array.isArray(aiPayload)) return null;
  const review = (aiPayload as Record<string, unknown>).review;
  if (!review || typeof review !== "object") return null;
  const r = review as Partial<ExtractionReview>;
  if (r.version !== 2 || !r.fields || typeof r.fields !== "object") return null;
  return {
    version: 2,
    fields: r.fields,
    verifiedBy: r.verifiedBy === "QR" || r.verifiedBy === "ITF" ? r.verifiedBy : null,
    cuitCorrection: r.cuitCorrection,
  };
}
