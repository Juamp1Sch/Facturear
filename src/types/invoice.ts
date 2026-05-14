import type { InvoiceStatus } from "@prisma/client";

export type SerializedAccountingAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
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
  supplierCode: string | null;
  aiConfidence: number | null;
  mimeType: string;
  accountingAccount: SerializedAccountingAccount | null;
};

export type SerializedInvoiceDetail = SerializedInvoiceListItem & {
  originalFileUrl: string;
  originalFileKey: string;
  rawOcrText: string | null;
  invoiceType: string | null;
  aiPayload: unknown;
};
