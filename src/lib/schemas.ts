import { z } from "zod";

/** Structured extraction from OCR text (Argentina-style invoices). */
export const invoiceExtractionSchema = z.object({
  provider: z.string().nullable().describe("Razón social o nombre del proveedor"),
  cuit: z.string().nullable().describe("CUIT en formato XX-XXXXXXXX-X o similar"),
  invoice_date: z.string().nullable().describe("Fecha de emisión ISO YYYY-MM-DD"),
  invoice_number: z.string().nullable().describe("Número de comprobante si aparece"),
  invoice_type: z
    .string()
    .nullable()
    .describe("Tipo de comprobante AFIP: A, B, C, M, E, etc."),
  net_amount: z.number().nullable().describe("Importe neto gravado (sin IVA)"),
  vat_amount: z.number().nullable().describe("Importe de IVA"),
  total_amount: z.number().nullable().describe("Importe total"),
  accounting_account: z
    .string()
    .nullable()
    .describe("Nombre sugerido de cuenta contable en español"),
  confidence: z.number().min(0).max(1).describe("Confianza global 0-1"),
});

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;
