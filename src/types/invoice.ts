import type { InvoiceStatus } from "@prisma/client";

export type SerializedAccountingAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
};

export type SerializedChartAccount = {
  id: string;
  code: string;
  name: string;
  type: string | null;
};

export type SerializedInvoiceListItem = {
  id: string;
  status: InvoiceStatus;
  createdAt: string;
  providerName: string | null;
  providerCuit: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalAmount: string | null;
  netAmount: string | null;
  vatAmount: string | null;
  perceptionsAmount: string | null;
  supplierCode: string | null;
  movementId: string | null;
  empresa: string | null;
  sucursal: string | null;
  /** Valores guardados por CUIT; ausentes si el item no fue enriquecido. */
  cuitEmpresaOptions?: string[];
  cuitSucursalOptions?: string[];
  documentKind: string | null;
  aiConfidence: number | null;
  mimeType: string;
  accountingAccount: SerializedAccountingAccount | null;
  chartAccount: SerializedChartAccount | null;
  destinationUploadedAt: string | null;
};

export type SerializedInvoiceFilePart = {
  partIndex: number;
  fileKey: string;
  fileUrl: string;
  mimeType: string;
  signedUrl: string;
};

export type SerializedInvoiceDetail = SerializedInvoiceListItem & {
  batchId: string | null;
  originalFileUrl: string;
  originalFileKey: string;
  rawOcrText: string | null;
  invoiceType: string | null;
  aiPayload: unknown;
  files: SerializedInvoiceFilePart[];
};

/** Factura serializada para la vista de resultados del lote en /upload */
export type SerializedBatchInvoice = SerializedInvoiceDetail;
