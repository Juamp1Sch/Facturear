/**
 * Resultado de verificación de la extracción v2, guardado en `aiPayload.review`.
 * Sin dependencias de servidor: lo lee la UI para marcar campos "Revisar".
 */
export type ReviewFieldKey =
  | "cuit"
  | "invoice_number"
  | "invoice_date"
  | "amounts"
  | "fiscal_auth"
  | "extraction";

const REVIEW_FIELD_KEYS: readonly ReviewFieldKey[] = [
  "cuit",
  "invoice_number",
  "invoice_date",
  "amounts",
  "fiscal_auth",
  "extraction",
];

/** Campos tomados del QR / código de barras de ARCA (exactos, no del OCR del modelo). */
export type VerifiedField =
  | "cuit"
  | "invoice_date"
  | "invoice_number"
  | "invoice_type"
  | "total"
  | "fiscal_auth";

const VERIFIED_FIELDS: readonly VerifiedField[] = [
  "cuit",
  "invoice_date",
  "invoice_number",
  "invoice_type",
  "total",
  "fiscal_auth",
];

export type ExtractionReview = {
  version: 2;
  /** Campo → motivo por el que conviene revisarlo. */
  fields: Partial<Record<ReviewFieldKey, string>>;
  /** Si CUIT/fecha/número/total/CAE salieron del QR o código de barras de ARCA (exactos). */
  verifiedBy: "QR" | "ITF" | null;
  /**
   * Qué campos salieron de verdad del código (el ITF solo trae CUIT y CAE; el QR, casi todo).
   * La UI solo afirma como verificados estos.
   */
  verifiedFields?: VerifiedField[];
  /** CUIT corregido contra el maestro de proveedores. */
  cuitCorrection?: { from: string | null; to: string; supplierName: string };
};

export function readExtractionReview(aiPayload: unknown): ExtractionReview | null {
  if (!aiPayload || typeof aiPayload !== "object" || Array.isArray(aiPayload)) return null;
  const review = (aiPayload as Record<string, unknown>).review;
  if (!review || typeof review !== "object") return null;
  const r = review as Partial<ExtractionReview>;
  if (r.version !== 2 || !r.fields || typeof r.fields !== "object") return null;
  // Datos persistidos: solo motivos de texto (un objeto rompería el render de React).
  const fields: ExtractionReview["fields"] = {};
  for (const [k, v] of Object.entries(r.fields as Record<string, unknown>)) {
    if (typeof v === "string" && REVIEW_FIELD_KEYS.includes(k as ReviewFieldKey)) {
      fields[k as ReviewFieldKey] = v;
    }
  }
  const cc = r.cuitCorrection as Record<string, unknown> | undefined;
  const cuitCorrection =
    cc && typeof cc.to === "string" && typeof cc.supplierName === "string"
      ? { from: typeof cc.from === "string" ? cc.from : null, to: cc.to, supplierName: cc.supplierName }
      : undefined;
  return {
    version: 2,
    fields,
    verifiedBy: r.verifiedBy === "QR" || r.verifiedBy === "ITF" ? r.verifiedBy : null,
    verifiedFields: Array.isArray(r.verifiedFields)
      ? r.verifiedFields.filter((f): f is VerifiedField => VERIFIED_FIELDS.includes(f))
      : [],
    cuitCorrection,
  };
}
