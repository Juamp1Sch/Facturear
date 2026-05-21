import { getSignedReadUrl } from "@/lib/storage";
import type {
  SerializedBatchInvoice,
  SerializedInvoiceFilePart,
} from "@/types/invoice";

type InvoiceWithRelations = {
  id: string;
  batchId: string | null;
  status: string;
  createdAt: Date;
  providerName: string | null;
  providerCuit: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  totalAmount: { toString(): string } | null;
  netAmount: { toString(): string } | null;
  vatAmount: { toString(): string } | null;
  perceptionsAmount: { toString(): string } | null;
  supplierCode: string | null;
  movementId: string | null;
  empresa: string | null;
  sucursal: string | null;
  documentKind: string | null;
  aiConfidence: number | null;
  mimeType: string;
  originalFileUrl: string;
  originalFileKey: string;
  rawOcrText: string | null;
  invoiceType: string | null;
  aiPayload: unknown;
  destinationUploadedAt: Date | null;
  accountingAccount: {
    id: string;
    code: string;
    name: string;
    type: string;
  } | null;
  chartAccount: {
    id: string;
    code: string;
    name: string;
    type: string | null;
  } | null;
  files: {
    partIndex: number;
    fileKey: string;
    fileUrl: string;
    mimeType: string;
  }[];
};

export async function serializeInvoiceForBatch(
  invoice: InvoiceWithRelations,
): Promise<SerializedBatchInvoice> {
  const filesSorted = [...invoice.files].sort(
    (a, b) => a.partIndex - b.partIndex,
  );
  const signedParts: SerializedInvoiceFilePart[] = await Promise.all(
    filesSorted.map(async (f) => ({
      partIndex: f.partIndex,
      fileKey: f.fileKey,
      fileUrl: f.fileUrl,
      mimeType: f.mimeType,
      signedUrl: await getSignedReadUrl(f.fileKey),
    })),
  );

  const base = JSON.parse(JSON.stringify(invoice)) as Record<string, unknown>;
  return {
    ...(base as Omit<SerializedBatchInvoice, "files">),
    createdAt:
      invoice.createdAt instanceof Date
        ? invoice.createdAt.toISOString()
        : String(invoice.createdAt),
    invoiceDate: invoice.invoiceDate
      ? invoice.invoiceDate.toISOString().slice(0, 10)
      : null,
    totalAmount: invoice.totalAmount?.toString() ?? null,
    netAmount: invoice.netAmount?.toString() ?? null,
    vatAmount: invoice.vatAmount?.toString() ?? null,
    perceptionsAmount: invoice.perceptionsAmount?.toString() ?? null,
    destinationUploadedAt: invoice.destinationUploadedAt
      ? invoice.destinationUploadedAt.toISOString()
      : null,
    files: signedParts.length > 0 ? signedParts : [
      {
        partIndex: 0,
        fileKey: invoice.originalFileKey,
        fileUrl: invoice.originalFileUrl,
        mimeType: invoice.mimeType,
        signedUrl: await getSignedReadUrl(invoice.originalFileKey),
      },
    ],
  };
}
