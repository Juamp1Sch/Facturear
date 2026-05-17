export type DocumentKind = "FACTURA" | "NOTA_CREDITO" | "NOTA_DEBITO";

export function parseDocumentKind(
  value: string | null | undefined,
): DocumentKind | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (v === "FACTURA" || v === "NOTA_CREDITO" || v === "NOTA_DEBITO") {
    return v;
  }
  return null;
}

/**
 * Mapea letra AFIP + tipo de documento → código de comprobante (FA, NCA, NDA, etc.).
 */
export function buildCodigoComprobante(
  letter: string | null,
  kind: DocumentKind | null,
): string | null {
  if (!letter) return null;
  const L = letter.trim().toUpperCase().slice(0, 1);
  if (!/^[ABCEM]$/.test(L)) return null;
  const prefix =
    kind === "NOTA_CREDITO" ? "NC" : kind === "NOTA_DEBITO" ? "ND" : "F";
  return `${prefix}${L}`;
}
