export type DocumentKind =
  | "FACTURA"
  | "NOTA_CREDITO"
  | "NOTA_DEBITO"
  | "REMITO"
  | "PRESUPUESTO";

export const DOCUMENT_KIND_OPTIONS: { value: DocumentKind; label: string }[] =
  [
    { value: "FACTURA", label: "Factura" },
    { value: "NOTA_CREDITO", label: "Nota de crédito" },
    { value: "NOTA_DEBITO", label: "Nota de débito" },
    { value: "REMITO", label: "Remito" },
    { value: "PRESUPUESTO", label: "Presupuesto" },
  ];

export function parseDocumentKind(
  value: string | null | undefined,
): DocumentKind | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (
    v === "FACTURA" ||
    v === "NOTA_CREDITO" ||
    v === "NOTA_DEBITO" ||
    v === "REMITO" ||
    v === "PRESUPUESTO"
  ) {
    return v;
  }
  return null;
}

export function documentKindLabel(value: string | null | undefined): string {
  const parsed = parseDocumentKind(value);
  if (!parsed) return "—";
  const opt = DOCUMENT_KIND_OPTIONS.find((o) => o.value === parsed);
  return opt?.label ?? "—";
}

export function isPresupuestoKind(value: string | null | undefined): boolean {
  return parseDocumentKind(value) === "PRESUPUESTO";
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
