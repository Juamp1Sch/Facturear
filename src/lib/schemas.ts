import { z } from "zod";

/** Structured extraction from OCR text (Argentina-style invoices). */
export const invoiceExtractionSchema = z.object({
  provider: z
    .string()
    .nullable()
    .describe("Razón social del EMISOR / vendedor (membrete), no del cliente"),
  cuit: z
    .string()
    .nullable()
    .describe(
      "CUIT del EMISOR: solo cabecera/membrete (11 dígitos, formato XX-XXXXXXXX-X). Nunca cliente/receptor. Si hay 11 dígitos legibles en cabecera, devolverlos aunque exista otro CUIT en el cuerpo; no null por cautela AFIP.",
    ),
  invoice_date: z
    .string()
    .nullable()
    .describe("Fecha de emisión del comprobante (recuadro FECHA), ISO YYYY-MM-DD"),
  invoice_number: z
    .string()
    .nullable()
    .describe(
      "Número de comprobante AFIP. Si en cabecera (recuadro superior derecho, junto a FACTURA A/B/C) aparecen Punto de Venta y Número por separado, devolvé UN solo string NNNNN-NNNNNNNN: 5 dígitos de punto de venta + guion + 8 dígitos de número, con ceros a la izquierda (ej. PV 4 y Nro 59991 → 00004-00059991). Si solo hay un número sin punto de venta, devolvé ese valor legible sin inventar PV. No uses CAE, OC, códigos de ítem ni números de cliente.",
    ),
  invoice_type: z
    .string()
    .nullable()
    .describe("Tipo de comprobante AFIP: A, B, C, M, E, etc."),
  document_kind: z
    .enum(["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO"])
    .nullable()
    .describe(
      "Tipo de documento: FACTURA, NOTA_CREDITO o NOTA_DEBITO según el encabezado del comprobante",
    ),
  net_amount: z.number().nullable().describe("Importe neto gravado (sin IVA)"),
  vat_amount: z.number().nullable().describe("Importe de IVA"),
  total_amount: z.number().nullable().describe("Importe total"),
  chart_account_code: z
    .string()
    .nullable()
    .describe(
      "Código de cuenta del plan importado (columna Cuenta: ej. 1001 Efectivo, 2007 Galicia). Solo si hay plan cargado y hay señal en el comprobante.",
    ),
  confidence: z.number().min(0).max(1).describe("Confianza global 0-1"),
});

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;
