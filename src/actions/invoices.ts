"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type InvoiceStatus } from "@prisma/client";

import { auth } from "@/auth";
import { isApiConfiguredForUser } from "@/actions/api-config";
import {
  extractInvoiceData,
  extractInvoiceDataFromImage,
  extractInvoiceDataFromImages,
} from "@/lib/ai";
import {
  enrichExtractedDiscounts,
  hasAnyDiscountSignal,
  logDiscountResolution,
} from "@/lib/discount-breakdown";
import {
  fetchAmountsSupplementCropped,
  fetchDiscountSupplementCropped,
  finalizeExtractedAmounts,
} from "@/lib/extraction-amounts";
import {
  pickFooterVisionImages,
  preprocessVisionImages,
} from "@/lib/image-preprocess";
import type { AmountsSupplement, DiscountSupplement } from "@/lib/schemas";
import { parseTaxBreakdownFromPayload } from "@/lib/tax-breakdown";
import { buildVatLinesFromRates, sumVatFromRates } from "@/lib/vat-rate";
import { enrichExtractionFiscalAuth } from "@/lib/enrich-extraction-fiscal-auth";
import {
  serializeInvoiceForBatch,
  type CuitAssociationOptionMaps,
} from "@/lib/serialize-invoice";
import {
  getCuitAssociationsForCuits,
  resolveEmpresaSucursalForInvoice,
  upsertCuitEmpresa,
  upsertCuitSucursal,
} from "@/lib/cuit-associations";
import {
  resolveTaxChartAccountsForUser,
  type ResolvedTaxChartAccounts,
} from "@/lib/tax-chart-account";
import type { SerializedBatchInvoice } from "@/types/invoice";
import type { InvoiceExtraction } from "@/lib/schemas";
import { isDatabaseConfigured } from "@/lib/database-config";
import {
  normalizeArgentineCuitFromAiOrNull,
  validateArgentineCuitForEntry,
} from "@/lib/cuit-argentina";
import { parseAiInvoiceDate } from "@/lib/invoice-calendar-date";
import { normalizeNumeroComprobanteFromAiOrNull } from "@/lib/numero-comprobante";
import { prisma } from "@/lib/db";
import { parseTipoMonedaForStorage } from "@/lib/tipo-moneda";
import { loadChartAccountHintsBlock } from "@/lib/chart-account-ai-hints";
import { resolveChartAccountForExtraction } from "@/lib/chart-account-match";
import { resolveChartAccountForSupplierCode } from "@/lib/supplier-chart-account";
import { loadSupplierMaestroCuitHintsBlock } from "@/lib/supplier-ai-hints";
import { pickSupplierByCode, resolveOrCreateInvoiceSupplier } from "@/lib/resolve-invoice-supplier";
import { runOcr } from "@/lib/ocr";
import { rasterizePdfFirstPagePng } from "@/lib/pdf-raster";
import { buildMovementId } from "@/lib/movement-id";
import { parseDocumentKind } from "@/lib/comprobante-code";
import {
  parseFiscalDocumentClass,
  resolveDocumentClassification,
} from "@/lib/document-class";
import { rememberSupplierAlias } from "@/lib/supplier-alias";
import { formatOpenAIExtractionError } from "@/lib/openai-retry";
import { readInvoiceFile, uploadBuffer } from "@/lib/storage";

const MAX_BYTES = 10 * 1024 * 1024;
const BATCH_MAX_FILES = Number(process.env.BATCH_MAX_FILES ?? "10") || 10;
/**
 * Facturas procesadas en paralelo. En Tier 1 de OpenAI (gpt-4o = 30.000 TPM) el cuello
 * de botella es el TPM, no el RPM: con 2 alcanza y más solo gatilla 429 + backoff.
 * Al pasar a Tier 2 (~450.000 TPM) conviene subir a 4-5 vía BATCH_CONCURRENCY en .env.
 */
const BATCH_CONCURRENCY = Math.max(
  1,
  Number(process.env.BATCH_CONCURRENCY ?? "2") || 2,
);
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);

export type UploadBatchState =
  | { status: "idle" }
  | {
      status: "ok";
      batchId: string;
      invoiceIds: string[];
      invoices: SerializedBatchInvoice[];
      taxChartAccounts: ResolvedTaxChartAccounts;
      apiConfigured: boolean;
    }
  | { status: "error"; message: string };

async function loadSerializedBatchInvoices(
  userId: string,
  invoiceIds: string[],
): Promise<SerializedBatchInvoice[]> {
  const rows = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds }, userId },
    include: {
      chartAccount: true,
      accountingAccount: true,
      files: { orderBy: { partIndex: "asc" } },
    },
  });

  const order = new Map(invoiceIds.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const { empresasByCuit, sucursalesByCuit } =
    await getCuitAssociationsForCuits(
      userId,
      rows.map((r) => r.providerCuit),
    );
  const cuitOptions: CuitAssociationOptionMaps = {
    empresasByCuit,
    sucursalesByCuit,
  };

  return Promise.all(
    rows.map((row) => serializeInvoiceForBatch(row, cuitOptions)),
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]!, i);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function parseFileGroups(
  raw: FormDataEntryValue | null,
  fileCount: number,
): number[][] {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Falta la agrupación de archivos.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("La agrupación de archivos no es válida.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("La agrupación de archivos no es válida.");
  }
  const groups = parsed as number[][];
  const seen = new Set<number>();
  for (const group of groups) {
    if (!Array.isArray(group) || group.length === 0) {
      throw new Error("Cada factura debe tener al menos un archivo.");
    }
    for (const idx of group) {
      if (typeof idx !== "number" || idx < 0 || idx >= fileCount || seen.has(idx)) {
        throw new Error("Índices de agrupación inválidos.");
      }
      seen.add(idx);
    }
  }
  if (seen.size !== fileCount) {
    throw new Error("Todos los archivos deben pertenecer a una factura.");
  }
  return groups;
}

type UploadedPart = {
  buffer: Buffer;
  mimeType: string;
  key: string;
  publicUrl: string;
};

async function extractFromParts(
  parts: UploadedPart[],
  extractOpts: {
    maestroCuitHintsBlock: string | null;
    chartAccountHintsBlock: string | null;
  },
): Promise<{
  extracted: InvoiceExtraction;
  rawOcrText: string | null;
  visionImages?: { buffer: Buffer; mimeType: "image/jpeg" | "image/png" }[];
  amountsSupplement?: AmountsSupplement | null;
  discountSupplement?: DiscountSupplement | null;
}> {
  const pdfTexts: { partNum: number; text: string; weak: boolean }[] = [];
  const allPdf = parts.every((p) => p.mimeType === "application/pdf");

  if (allPdf) {
    for (let i = 0; i < parts.length; i++) {
      const text = await runOcr(parts[i]!.buffer, "application/pdf");
      pdfTexts.push({
        partNum: i + 1,
        text,
        weak: pdfEmbeddedTextIsWeak(text),
      });
    }
    const allStrong = pdfTexts.every((p) => !p.weak);
    if (allStrong) {
      const combined = pdfTexts
        .map((p) => `--- Parte ${p.partNum} ---\n${p.text}`)
        .join("\n\n");
      const extracted = await extractInvoiceData(combined, extractOpts);
      const enriched = await enrichExtractionFiscalAuth(extracted, {
        rawOcrText: combined,
      });
      return { extracted: enriched, rawOcrText: combined };
    }
  }

  const visionImages: { buffer: Buffer; mimeType: "image/jpeg" | "image/png" }[] =
    [];
  const ocrNotes: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.mimeType === "application/pdf") {
      const pdfText = await runOcr(part.buffer, part.mimeType);
      if (!pdfEmbeddedTextIsWeak(pdfText)) {
        ocrNotes.push(`--- Parte ${i + 1} (PDF texto) ---\n${pdfText.slice(0, 8000)}`);
      }
      const pagePng = await rasterizePdfFirstPagePng(part.buffer);
      visionImages.push({ buffer: pagePng, mimeType: "image/png" });
    } else {
      visionImages.push({
        buffer: part.buffer,
        mimeType: part.mimeType as "image/jpeg" | "image/png",
      });
    }
  }

  const preprocessedImages = await preprocessVisionImages(visionImages);
  // La relectura de totales no depende de la extracción principal: corren en paralelo.
  const [extracted, amountsSupplement] = await Promise.all([
    extractInvoiceDataFromImages(preprocessedImages, extractOpts),
    fetchAmountsSupplementCropped(preprocessedImages),
  ]);
  const rawOcrText =
    ocrNotes.length > 0
      ? `${ocrNotes.join("\n\n")}\n\n[Campos inferidos por visión en ${parts.length} parte(s).]`
      : `[${parts.length} parte(s): campos inferidos por visión.]`;
  const footerImages = pickFooterVisionImages(preprocessedImages);
  const wantDiscount = hasAnyDiscountSignal({ extracted, rawOcrText });
  const [enriched, discountSupplement] = await Promise.all([
    enrichExtractionFiscalAuth(extracted, {
      rawOcrText,
      visionImages: footerImages,
    }),
    wantDiscount
      ? fetchDiscountSupplementCropped(preprocessedImages, {
          rawOcrText,
          providerName: extracted.provider,
          discountLines: extracted.discount_lines,
        })
      : Promise.resolve(null),
  ]);
  return {
    extracted: enriched,
    rawOcrText,
    visionImages: preprocessedImages,
    amountsSupplement,
    discountSupplement,
  };
}

async function applyExtractionToInvoice(
  invoiceId: string,
  userId: string,
  extracted: InvoiceExtraction,
  rawOcrText: string | null,
  visionImages?: { buffer: Buffer; mimeType: "image/jpeg" | "image/png" }[],
  amountsSupplement?: AmountsSupplement | null,
  discountSupplement?: DiscountSupplement | null,
  options?: {
    preserveMovementId?: string | null;
    resetDestinationUpload?: boolean;
  },
): Promise<void> {
  const prior = await prisma.invoice.findFirst({
    where: { id: invoiceId },
    select: { empresa: true, sucursal: true },
  });

  const resolved = await resolveOrCreateInvoiceSupplier(
    userId,
    extracted.provider,
    extracted.cuit,
  );
  const aiCuit = normalizeArgentineCuitFromAiOrNull(extracted.cuit);
  const providerCuit = resolved?.cuit ?? aiCuit;
  const supplierCode = resolved?.code ?? null;

  let empresaOut = prior?.empresa ?? null;
  let sucursalOut = prior?.sucursal ?? null;
  if (providerCuit) {
    const r = await resolveEmpresaSucursalForInvoice(userId, providerCuit);
    if (!empresaOut?.trim() && r.autoEmpresa) empresaOut = r.autoEmpresa;
    if (!sucursalOut?.trim() && r.autoSucursal)
      sucursalOut = r.autoSucursal;
  }

  const chartAccount =
    (await resolveChartAccountForSupplierCode(userId, supplierCode)) ??
    (await resolveChartAccountForExtraction(userId, extracted.chart_account_code, null));

  const invoiceDate = parseAiInvoiceDate(extracted.invoice_date);
  const movementId =
    options?.preserveMovementId ??
    (await allocateUniqueMovementId(invoiceDate));
  const doc = resolveDocumentClassification(extracted, rawOcrText);
  const documentKind = doc.documentKind;
  const documentClass = doc.documentClass;
  const afipCode = doc.afipCode;
  const fiscalAuthType = doc.fiscalAuthType;
  const fiscalAuthCode = doc.fiscalAuthCode;

  const finalized = await finalizeExtractedAmounts(extracted, visionImages, {
    precomputedSupplement: amountsSupplement,
  });
  const { extracted: resolvedExtracted, debug: discountResolution } =
    enrichExtractedDiscounts(finalized.extracted, {
      rawOcrText,
      supplement: discountSupplement,
    });
  logDiscountResolution(`invoice:${invoiceId}`, discountResolution);

  const aiPayloadOut: Record<string, unknown> = {
    ...(resolvedExtracted as Record<string, unknown>),
  };
  if (discountResolution) {
    aiPayloadOut.discount_resolution = discountResolution;
  }
  aiPayloadOut.amounts_reconciled = finalized.amountsReconciled;
  if (finalized.amountsDiscrepancy != null) {
    aiPayloadOut.amounts_discrepancy = finalized.amountsDiscrepancy;
  }
  if (finalized.amountsAlgebraicallyDerived) {
    aiPayloadOut.amounts_algebraically_derived = true;
  }
  if (finalized.correctedField) {
    aiPayloadOut.amounts_corrected_field = finalized.correctedField;
  }
  if (supplierCode) aiPayloadOut.supplier_code = supplierCode;
  if (resolved?.cuit) aiPayloadOut.cuit = providerCuit;
  aiPayloadOut.document_class = documentClass;
  aiPayloadOut.afip_comprobante_code = afipCode;
  aiPayloadOut.fiscal_auth_type = fiscalAuthType;
  aiPayloadOut.fiscal_auth_code = fiscalAuthCode;
  if (chartAccount) {
    aiPayloadOut.chart_account_code = chartAccount.code;
    aiPayloadOut.chart_account_name = chartAccount.name;
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      rawOcrText,
      providerName: resolvedExtracted.provider,
      providerCuit,
      supplierCode,
      empresa: empresaOut,
      sucursal: sucursalOut,
      movementId,
      documentKind,
      documentClass,
      afipCode,
      fiscalAuthType,
      fiscalAuthCode,
      invoiceNumber: normalizeNumeroComprobanteFromAiOrNull(resolvedExtracted.invoice_number),
      invoiceType: resolvedExtracted.invoice_type,
      invoiceDate,
      netAmount:
        finalized.netAmount != null
          ? new Prisma.Decimal(finalized.netAmount)
          : null,
      vatAmount:
        finalized.vatAmount != null ? new Prisma.Decimal(finalized.vatAmount) : null,
      perceptionsAmount:
        finalized.perceptionsAmount != null
          ? new Prisma.Decimal(finalized.perceptionsAmount)
          : null,
      totalAmount:
        finalized.totalAmount != null
          ? new Prisma.Decimal(finalized.totalAmount)
          : null,
      chartAccountId: chartAccount?.id ?? null,
      aiConfidence: resolvedExtracted.confidence,
      aiPayload: aiPayloadOut as object,
      status: "READY",
      ...(options?.resetDestinationUpload
        ? {
            destinationUploadedAt: null,
            destinationUploadStatus: null,
            destinationUploadBody: null,
          }
        : {}),
    },
  });
}

async function processInvoiceGroup(
  userId: string,
  batchId: string,
  indices: number[],
  files: File[],
  buffers: Buffer[],
  mimeTypes: string[],
  extractOpts: {
    maestroCuitHintsBlock: string | null;
    chartAccountHintsBlock: string | null;
  },
): Promise<string> {
  const uploadedParts: UploadedPart[] = [];
  for (const idx of indices) {
    const mimeType = mimeTypes[idx]!;
    const buffer = buffers[idx]!;
    const ext = extForMime(mimeType);
    const key = `invoices/${userId}/${randomUUID()}.${ext}`;
    const uploaded = await uploadBuffer({ key, buffer, contentType: mimeType });
    uploadedParts.push({
      buffer,
      mimeType,
      key: uploaded.key,
      publicUrl: uploaded.publicUrl,
    });
  }

  const first = uploadedParts[0]!;
  const invoice = await prisma.invoice.create({
    data: {
      userId,
      batchId,
      originalFileUrl: first.publicUrl,
      originalFileKey: first.key,
      mimeType: first.mimeType,
      status: "PROCESSING",
      files: {
        create: uploadedParts.map((p, partIndex) => ({
          partIndex,
          fileKey: p.key,
          fileUrl: p.publicUrl,
          mimeType: p.mimeType,
        })),
      },
    },
  });

  try {
    const { extracted, rawOcrText, visionImages, amountsSupplement, discountSupplement } =
      await extractFromParts(uploadedParts, extractOpts);
    await applyExtractionToInvoice(
      invoice.id,
      userId,
      extracted,
      rawOcrText,
      visionImages,
      amountsSupplement,
      discountSupplement,
    );
    revalidatePath(`/history/${invoice.id}`);
    return invoice.id;
  } catch (e) {
    const message = formatOpenAIExtractionError(e);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "ERROR",
        aiPayload: { error: message } as object,
      },
    });
    revalidatePath(`/history/${invoice.id}`);
    return invoice.id;
  }
}

/** Menos que esto suele ser PDF escaneado o solo metadatos; pasamos a visión en la 1.ª página. */
const MIN_PDF_TEXT_CHARS = 32;

function pdfEmbeddedTextIsWeak(text: string): boolean {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length < MIN_PDF_TEXT_CHARS;
}

/** Some cameras / OS report empty type, `image/jpg`, or `application/octet-stream` for JPEG. */
function normalizeDeclaredMime(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (t === "image/jpg" || t === "image/pjpeg" || t === "image/x-citrix-jpeg") {
    return "image/jpeg";
  }
  return t;
}

function mimeFromFileName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".jpe")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".png")) return "image/png";
  return null;
}

function sniffMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return "application/pdf";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  return null;
}

function resolveInvoiceMimeType(file: File, buffer: Buffer): string | null {
  const declared = normalizeDeclaredMime(file.type || "");
  if (ALLOWED.has(declared)) return declared;
  const sniffed = sniffMimeFromBuffer(buffer);
  if (sniffed && ALLOWED.has(sniffed)) return sniffed;
  const loose = !declared || declared === "application/octet-stream";
  if (loose) {
    const fromName = mimeFromFileName(file.name);
    if (fromName && ALLOWED.has(fromName)) return fromName;
  }
  return null;
}

async function allocateUniqueMovementId(
  invoiceDate: Date | null,
): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const movementId = buildMovementId(invoiceDate);
    const existing = await prisma.invoice.findUnique({
      where: { movementId },
      select: { id: true },
    });
    if (!existing) return movementId;
  }
  throw new Error("No se pudo generar un ID de movimiento único.");
}

function extForMime(mime: string): string {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    default:
      return "bin";
  }
}

export async function uploadInvoice(formData: FormData) {
  if (!isDatabaseConfigured()) {
    throw new Error(
      "Falta DATABASE_URL en .env. Configurá PostgreSQL y reiniciá el servidor (ver instrucciones en /upload).",
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("No se recibió ningún archivo.");
  }

  if (file.size > MAX_BYTES) {
    throw new Error("El archivo supera los 10 MB.");
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }
  const userId = session.user.id;
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = resolveInvoiceMimeType(file, buffer);
  if (!mimeType) {
    throw new Error(
      "Solo se permiten PDF, JPG o PNG. Si es un JPEG, probá renombrar a .jpg o .jpeg.",
    );
  }
  const ext = extForMime(mimeType);
  const key = `invoices/${userId}/${randomUUID()}.${ext}`;

  const uploaded = await uploadBuffer({ key, buffer, contentType: mimeType });

  const invoice = await prisma.invoice.create({
    data: {
      userId,
      originalFileUrl: uploaded.publicUrl,
      originalFileKey: uploaded.key,
      mimeType,
      status: "PROCESSING",
      files: {
        create: {
          partIndex: 0,
          fileKey: uploaded.key,
          fileUrl: uploaded.publicUrl,
          mimeType,
        },
      },
    },
  });

  try {
    const [maestroCuitHintsBlock, chartAccountHintsBlock] = await Promise.all([
      loadSupplierMaestroCuitHintsBlock(userId),
      loadChartAccountHintsBlock(userId),
    ]);
    const extractOpts = { maestroCuitHintsBlock, chartAccountHintsBlock };

    let rawOcrText: string | null = null;
    let extracted: InvoiceExtraction;
    let visionImages:
      | { buffer: Buffer; mimeType: "image/jpeg" | "image/png" }[]
      | undefined;

    if (mimeType === "application/pdf") {
      const pdfText = await runOcr(buffer, mimeType);
      if (pdfEmbeddedTextIsWeak(pdfText)) {
        const pagePng = await rasterizePdfFirstPagePng(buffer);
        const [preprocessed] = await preprocessVisionImages([
          { buffer: pagePng, mimeType: "image/png" },
        ]);
        visionImages = [preprocessed];
        extracted = await extractInvoiceDataFromImage(
          preprocessed.buffer,
          preprocessed.mimeType,
          extractOpts,
        );
        rawOcrText =
          pdfText.trim().length > 0
            ? `${pdfText.slice(0, 12_000)}\n\n[PDF escaneado: campos inferidos por visión en la página 1.]`
            : "[PDF escaneado sin texto seleccionable: campos inferidos por visión en la página 1.]";
      } else {
        rawOcrText = pdfText;
        extracted = await extractInvoiceData(pdfText, extractOpts);
      }
    } else {
      const [preprocessed] = await preprocessVisionImages([
        {
          buffer,
          mimeType: mimeType as "image/jpeg" | "image/png",
        },
      ]);
      visionImages = [preprocessed];
      extracted = await extractInvoiceDataFromImage(
        preprocessed.buffer,
        preprocessed.mimeType,
        extractOpts,
      );
      rawOcrText = "[Campos inferidos por visión.]";
    }

    let amountsSupplement: AmountsSupplement | null = null;
    let discountSupplement: DiscountSupplement | null = null;
    if (visionImages?.length) {
      const footerImages = pickFooterVisionImages(visionImages);
      const wantDiscount = hasAnyDiscountSignal({ extracted, rawOcrText });
      const [enriched, supplement, discountSupp] = await Promise.all([
        enrichExtractionFiscalAuth(extracted, {
          rawOcrText,
          visionImages: footerImages,
        }),
        fetchAmountsSupplementCropped(visionImages),
        wantDiscount
          ? fetchDiscountSupplementCropped(visionImages, {
              rawOcrText,
              providerName: extracted.provider,
              discountLines: extracted.discount_lines,
            })
          : Promise.resolve(null),
      ]);
      extracted = enriched;
      amountsSupplement = supplement;
      discountSupplement = discountSupp;
    } else {
      extracted = await enrichExtractionFiscalAuth(extracted, { rawOcrText });
    }

    const finalized = await finalizeExtractedAmounts(extracted, visionImages, {
      precomputedSupplement: amountsSupplement,
    });
    const { extracted: resolvedExtracted, debug: discountResolution } =
      enrichExtractedDiscounts(finalized.extracted, {
        rawOcrText,
        supplement: discountSupplement,
      });
    logDiscountResolution("uploadSingle", discountResolution);

    const resolved = await resolveOrCreateInvoiceSupplier(
      userId,
      resolvedExtracted.provider,
      resolvedExtracted.cuit,
    );
    const aiCuit = normalizeArgentineCuitFromAiOrNull(resolvedExtracted.cuit);
    const providerCuit = resolved?.cuit ?? aiCuit;
    const supplierCode = resolved?.code ?? null;
    const cuitResolution = await resolveEmpresaSucursalForInvoice(
      userId,
      providerCuit,
    );

    const chartAccount =
      (await resolveChartAccountForSupplierCode(userId, supplierCode)) ??
      (await resolveChartAccountForExtraction(userId, resolvedExtracted.chart_account_code, null));

    const invoiceDate = parseAiInvoiceDate(resolvedExtracted.invoice_date);
    const movementId = await allocateUniqueMovementId(invoiceDate);
    const doc = resolveDocumentClassification(resolvedExtracted, rawOcrText);
    const documentKind = doc.documentKind;
    const documentClass = doc.documentClass;
    const afipCode = doc.afipCode;
    const fiscalAuthType = doc.fiscalAuthType;
    const fiscalAuthCode = doc.fiscalAuthCode;

    const aiPayloadOut: Record<string, unknown> = {
      ...(resolvedExtracted as Record<string, unknown>),
    };
    if (discountResolution) {
      aiPayloadOut.discount_resolution = discountResolution;
    }
    aiPayloadOut.amounts_reconciled = finalized.amountsReconciled;
    if (finalized.amountsDiscrepancy != null) {
      aiPayloadOut.amounts_discrepancy = finalized.amountsDiscrepancy;
    }
    if (finalized.amountsAlgebraicallyDerived) {
      aiPayloadOut.amounts_algebraically_derived = true;
    }
    if (finalized.correctedField) {
      aiPayloadOut.amounts_corrected_field = finalized.correctedField;
    }
    if (supplierCode) {
      aiPayloadOut.supplier_code = supplierCode;
    }
    if (resolved?.cuit) {
      aiPayloadOut.cuit = providerCuit;
    }
    aiPayloadOut.document_class = documentClass;
    aiPayloadOut.afip_comprobante_code = afipCode;
    aiPayloadOut.fiscal_auth_type = fiscalAuthType;
    aiPayloadOut.fiscal_auth_code = fiscalAuthCode;
    if (chartAccount) {
      aiPayloadOut.chart_account_code = chartAccount.code;
      aiPayloadOut.chart_account_name = chartAccount.name;
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        rawOcrText,
        providerName: resolvedExtracted.provider,
        providerCuit,
        supplierCode,
        empresa: cuitResolution.autoEmpresa,
        sucursal: cuitResolution.autoSucursal,
        movementId,
        documentKind,
        documentClass,
        afipCode,
        fiscalAuthType,
        fiscalAuthCode,
        invoiceNumber: normalizeNumeroComprobanteFromAiOrNull(
          resolvedExtracted.invoice_number,
        ),
        invoiceType: resolvedExtracted.invoice_type,
        invoiceDate,
        netAmount:
          finalized.netAmount != null
            ? new Prisma.Decimal(finalized.netAmount)
            : null,
        vatAmount:
          finalized.vatAmount != null
            ? new Prisma.Decimal(finalized.vatAmount)
            : null,
        perceptionsAmount:
          finalized.perceptionsAmount != null
            ? new Prisma.Decimal(finalized.perceptionsAmount)
            : null,
        totalAmount:
          finalized.totalAmount != null
            ? new Prisma.Decimal(finalized.totalAmount)
            : null,
        chartAccountId: chartAccount?.id ?? null,
        aiConfidence: resolvedExtracted.confidence,
        aiPayload: aiPayloadOut as object,
        status: "READY",
      },
    });
  } catch (e) {
    const message = formatOpenAIExtractionError(e);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "ERROR",
        aiPayload: { error: message } as object,
      },
    });
    revalidatePath("/history");
    revalidatePath(`/history/${invoice.id}`);
    redirect(`/history/${invoice.id}?error=1`);
  }

  revalidatePath("/history");
  revalidatePath("/proveedores");
  revalidatePath(`/history/${invoice.id}`);
  redirect(`/history/${invoice.id}`);
}

export async function uploadInvoiceBatch(
  _prev: UploadBatchState,
  formData: FormData,
): Promise<UploadBatchState> {
  if (!isDatabaseConfigured()) {
    return {
      status: "error",
      message:
        "Falta DATABASE_URL en .env. Configurá PostgreSQL y reiniciá el servidor.",
    };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }
  const userId = session.user.id;

  const rawFiles = formData.getAll("files");
  const files = rawFiles.filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return { status: "error", message: "No se recibió ningún archivo." };
  }
  if (files.length > BATCH_MAX_FILES) {
    return {
      status: "error",
      message: `Máximo ${BATCH_MAX_FILES} archivos por lote.`,
    };
  }

  let groups: number[][];
  try {
    groups = parseFileGroups(formData.get("groups"), files.length);
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Agrupación inválida.",
    };
  }

  const buffers: Buffer[] = [];
  const mimeTypes: string[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return {
        status: "error",
        message: `El archivo "${file.name}" supera los 10 MB.`,
      };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = resolveInvoiceMimeType(file, buffer);
    if (!mimeType) {
      return {
        status: "error",
        message: `Formato no permitido en "${file.name}". Solo PDF, JPG o PNG.`,
      };
    }
    buffers.push(buffer);
    mimeTypes.push(mimeType);
  }

  const batchId = randomUUID();
  const [maestroCuitHintsBlock, chartAccountHintsBlock] = await Promise.all([
    loadSupplierMaestroCuitHintsBlock(userId),
    loadChartAccountHintsBlock(userId),
  ]);
  const extractOpts = { maestroCuitHintsBlock, chartAccountHintsBlock };

  const invoiceIds = await mapWithConcurrency(
    groups,
    BATCH_CONCURRENCY,
    (indices) =>
      processInvoiceGroup(
        userId,
        batchId,
        indices,
        files,
        buffers,
        mimeTypes,
        extractOpts,
      ),
  );

  revalidatePath("/history");
  revalidatePath("/proveedores");
  revalidatePath("/upload");

  const [invoices, taxChartAccounts, apiConfigured] = await Promise.all([
    loadSerializedBatchInvoices(userId, invoiceIds),
    resolveTaxChartAccountsForUser(userId),
    isApiConfiguredForUser(userId),
  ]);

  return {
    status: "ok",
    batchId,
    invoiceIds,
    invoices,
    taxChartAccounts,
    apiConfigured,
  };
}

export async function getBatchInvoicesForUpload(
  invoiceIds: string[],
): Promise<SerializedBatchInvoice[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  return loadSerializedBatchInvoices(session.user.id, invoiceIds);
}

export type UpdateInvoiceFieldsResult =
  | { ok: true; invoice: SerializedBatchInvoice }
  | { ok: false; error: string };

function formText(
  value: FormDataEntryValue | null | undefined,
): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Acepta punto o coma decimal y separadores de miles (punto estilo AR).
 * Vacío → null.
 */
function parseMoneyFromForm(
  value: FormDataEntryValue | null | undefined,
): Prisma.Decimal | null {
  const raw = formText(value);
  if (!raw) return null;
  const compact = raw.replace(/\s/g, "");
  let normalized: string;
  if (compact.includes(",")) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = compact;
  }
  const n = Number(normalized);
  if (Number.isNaN(n)) {
    throw new Error("MONTO_INVALIDO");
  }
  return new Prisma.Decimal(n);
}

export async function updateInvoiceExtractedFields(
  formData: FormData,
): Promise<UpdateInvoiceFieldsResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Base de datos no configurada." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const invoiceId = formText(formData.get("invoiceId"));
  if (!invoiceId) {
    return { ok: false, error: "Falta el identificador de la factura." };
  }

  const existing = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId: session.user.id },
  });
  if (!existing) {
    return { ok: false, error: "No se encontró la factura." };
  }
  if (existing.status === "PROCESSING") {
    return { ok: false, error: "La factura sigue procesándose." };
  }

  const providerName = formText(formData.get("providerName"));
  const cuitRaw = formData.get("providerCuit");
  const cuitStr = typeof cuitRaw === "string" ? cuitRaw : "";
  const cuitValidation = validateArgentineCuitForEntry(cuitStr, {
    requireVerifier: false,
  });
  if (!cuitValidation.ok) {
    return { ok: false, error: cuitValidation.message };
  }
  const providerCuit = cuitValidation.normalized;

  const invoiceDateRaw = formText(formData.get("invoiceDate"));
  let invoiceDate: Date | null = null;
  if (invoiceDateRaw) {
    invoiceDate = parseAiInvoiceDate(invoiceDateRaw);
    if (!invoiceDate) {
      return {
        ok: false,
        error: "La fecha no es válida. Usá el formato AAAA-MM-DD.",
      };
    }
  }

  const invoiceNumber = normalizeNumeroComprobanteFromAiOrNull(
    formText(formData.get("invoiceNumber")),
  );
  const invoiceType = formText(formData.get("invoiceType"));
  const empresa = formText(formData.get("empresa"));
  const sucursal = formText(formData.get("sucursal"));
  const documentKindRaw = formText(formData.get("documentKind"));
  const documentKind = parseDocumentKind(documentKindRaw);
  const documentClassRaw = formText(formData.get("documentClass"));
  const documentClass =
    documentKind === "PRESUPUESTO"
      ? null
      : parseFiscalDocumentClass(documentClassRaw) ??
        parseFiscalDocumentClass(existing.documentClass);

  let netAmount: Prisma.Decimal | null;
  let vatAmount: Prisma.Decimal | null;
  let perceptionsAmount: Prisma.Decimal | null;
  let discountAmount: Prisma.Decimal | null;
  let totalAmount: Prisma.Decimal | null;
  const vatBreakdownDiscriminated =
    formData.get("vatBreakdownDiscriminated") === "1";
  let vat21Parsed: Prisma.Decimal | null = null;
  let vat105Parsed: Prisma.Decimal | null = null;
  try {
    netAmount = parseMoneyFromForm(formData.get("netAmount"));
    if (vatBreakdownDiscriminated) {
      vat21Parsed = parseMoneyFromForm(formData.get("vatAmount21"));
      vat105Parsed = parseMoneyFromForm(formData.get("vatAmount105"));
      const vatTotal = sumVatFromRates(
        vat21Parsed != null ? Number(vat21Parsed) : null,
        vat105Parsed != null ? Number(vat105Parsed) : null,
      );
      vatAmount = vatTotal != null ? new Prisma.Decimal(vatTotal) : null;
    } else {
      vatAmount = parseMoneyFromForm(formData.get("vatAmount"));
    }
    perceptionsAmount = parseMoneyFromForm(formData.get("perceptionsAmount"));
    discountAmount = parseMoneyFromForm(formData.get("discountAmount"));
    totalAmount = parseMoneyFromForm(formData.get("totalAmount"));
  } catch (e) {
    if (e instanceof Error && e.message === "MONTO_INVALIDO") {
      return {
        ok: false,
        error: "Revisá los importes: usá números (ej. 1234,56 o 1234.56).",
      };
    }
    throw e;
  }

  const explicitCode = formText(formData.get("selectedSupplierCode"));
  let resolved = null as { code: string; cuit: string | null } | null;
  let finalProviderName = providerName;

  if (explicitCode) {
    const picked = await pickSupplierByCode(session.user.id, explicitCode);
    if (picked) {
      resolved = { code: picked.code, cuit: picked.cuit };
      finalProviderName = picked.name;
    }
  }

  if (!resolved) {
    resolved = await resolveOrCreateInvoiceSupplier(
      session.user.id,
      providerName,
      providerCuit,
    );
  }
  const finalCuit = resolved?.cuit ?? providerCuit;
  const supplierCode = resolved?.code ?? null;

  // Recordar el alias nombre→proveedor para que futuros presupuestos con el
  // mismo membrete (aunque abreviado) se asocien automáticamente.
  await rememberSupplierAlias(session.user.id, finalProviderName, supplierCode);

  await upsertCuitEmpresa(session.user.id, finalCuit, empresa);
  await upsertCuitSucursal(session.user.id, finalCuit, sucursal);

  const chartAccountCode = formText(formData.get("chartAccountCode"));
  const chartAccount = chartAccountCode
    ? await resolveChartAccountForExtraction(session.user.id, chartAccountCode, null)
    : await resolveChartAccountForSupplierCode(session.user.id, supplierCode);

  const nextStatus: InvoiceStatus =
    existing.status === "ERROR"
      ? "READY"
      : existing.status === "READY"
        ? "CORRECTED"
        : existing.status;

  const existingPayload =
    existing.aiPayload && typeof existing.aiPayload === "object" && !Array.isArray(existing.aiPayload)
      ? (existing.aiPayload as Record<string, unknown>)
      : {};
  const nextPayload = { ...existingPayload };
  if (documentClass) nextPayload.document_class = documentClass;
  else delete nextPayload.document_class;
  if (chartAccount) {
    nextPayload.chart_account_code = chartAccount.code;
    nextPayload.chart_account_name = chartAccount.name;
  } else {
    delete nextPayload.chart_account_code;
    delete nextPayload.chart_account_name;
  }
  if (vatBreakdownDiscriminated) {
    const vatLines = buildVatLinesFromRates(
      vat21Parsed != null ? Number(vat21Parsed) : null,
      vat105Parsed != null ? Number(vat105Parsed) : null,
    );
    if (vatLines) nextPayload.vat_lines = vatLines;
    else delete nextPayload.vat_lines;
  } else {
    const vatNum = vatAmount != null ? Number(vatAmount) : null;
    if (vatNum != null && vatNum > 0) {
      const existingVatLines = parseTaxBreakdownFromPayload(existingPayload).vatLines;
      const label =
        existingVatLines?.length === 1
          ? existingVatLines[0]!.label
          : "IVA 21%";
      nextPayload.vat_lines = [{ label, amount: vatNum }];
    } else {
      delete nextPayload.vat_lines;
    }
  }
  if (netAmount != null) nextPayload.net_amount = Number(netAmount);
  else delete nextPayload.net_amount;
  if (vatAmount != null) nextPayload.vat_amount = Number(vatAmount);
  else delete nextPayload.vat_amount;
  if (perceptionsAmount != null) {
    nextPayload.perceptions_amount = Number(perceptionsAmount);
  } else {
    delete nextPayload.perceptions_amount;
  }
  if (totalAmount != null) nextPayload.total_amount = Number(totalAmount);
  else delete nextPayload.total_amount;
  const discountNum = discountAmount != null ? Number(discountAmount) : null;
  if (discountNum != null && discountNum > 0) {
    nextPayload.discount_amount = discountNum;
    nextPayload.discount_lines = [{ label: "Bonificación", amount: discountNum }];
    delete nextPayload.discount_resolution;
  } else {
    delete nextPayload.discount_amount;
    delete nextPayload.discount_lines;
    delete nextPayload.discount_resolution;
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      providerName: finalProviderName,
      providerCuit: finalCuit,
      supplierCode,
      empresa,
      sucursal,
      documentKind,
      documentClass,
      invoiceNumber,
      invoiceType,
      invoiceDate,
      netAmount,
      vatAmount,
      perceptionsAmount,
      totalAmount,
      chartAccountId: chartAccount?.id ?? null,
      aiPayload: nextPayload as object,
      status: nextStatus,
    },
  });

  const [updated] = await loadSerializedBatchInvoices(session.user.id, [
    invoiceId,
  ]);
  if (!updated) {
    return { ok: false, error: "No se pudo cargar la factura actualizada." };
  }

  revalidatePath("/history");
  revalidatePath("/proveedores");
  revalidatePath("/upload");
  revalidatePath(`/history/${invoiceId}`);
  return { ok: true, invoice: updated };
}

export async function setInvoiceEmpresaSucursal(
  formData: FormData,
): Promise<UpdateInvoiceFieldsResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Base de datos no configurada." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const invoiceId = formText(formData.get("invoiceId"));
  if (!invoiceId) {
    return { ok: false, error: "Falta el identificador de la factura." };
  }

  const existing = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId: session.user.id },
  });
  if (!existing) {
    return { ok: false, error: "No se encontró la factura." };
  }
  if (existing.status === "PROCESSING") {
    return { ok: false, error: "La factura sigue procesándose." };
  }

  const empresa = formText(formData.get("empresa"));
  const sucursal = formText(formData.get("sucursal"));

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { empresa, sucursal },
  });

  await upsertCuitEmpresa(session.user.id, existing.providerCuit, empresa);
  await upsertCuitSucursal(session.user.id, existing.providerCuit, sucursal);

  const [updated] = await loadSerializedBatchInvoices(session.user.id, [
    invoiceId,
  ]);
  if (!updated) {
    return { ok: false, error: "No se pudo cargar la factura actualizada." };
  }

  revalidatePath("/history");
  revalidatePath("/proveedores");
  revalidatePath("/upload");
  revalidatePath(`/history/${invoiceId}`);
  return { ok: true, invoice: updated };
}

export async function setInvoiceTipoMoneda(
  formData: FormData,
): Promise<UpdateInvoiceFieldsResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Base de datos no configurada." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const invoiceId = formText(formData.get("invoiceId"));
  if (!invoiceId) {
    return { ok: false, error: "Falta el identificador de la factura." };
  }

  const existing = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId: session.user.id },
  });
  if (!existing) {
    return { ok: false, error: "No se encontró la factura." };
  }
  if (existing.status === "PROCESSING") {
    return { ok: false, error: "La factura sigue procesándose." };
  }

  const tipoMoneda = parseTipoMonedaForStorage(formText(formData.get("tipoMoneda")));

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { tipoMoneda },
  });

  const [updated] = await loadSerializedBatchInvoices(session.user.id, [
    invoiceId,
  ]);
  if (!updated) {
    return { ok: false, error: "No se pudo cargar la factura actualizada." };
  }

  revalidatePath("/history");
  revalidatePath("/proveedores");
  revalidatePath("/upload");
  revalidatePath(`/history/${invoiceId}`);
  return { ok: true, invoice: updated };
}

export type ReprocessInvoiceResult =
  | { ok: true; invoice: SerializedBatchInvoice }
  | { ok: false; error: string };

export async function reprocessInvoice(
  invoiceId: string,
): Promise<ReprocessInvoiceResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Base de datos no configurada." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }
  const userId = session.user.id;

  const existing = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    include: { files: { orderBy: { partIndex: "asc" } } },
  });
  if (!existing) {
    return { ok: false, error: "No se encontró la factura." };
  }

  const previousStatus = existing.status;
  const previousAiPayload = existing.aiPayload;

  const claimed = await prisma.invoice.updateMany({
    where: {
      id: invoiceId,
      userId,
      status: { not: "PROCESSING" },
    },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) {
    return { ok: false, error: "La factura sigue procesándose." };
  }

  try {
    const fileParts =
      existing.files.length > 0
        ? existing.files
        : [
            {
              partIndex: 0,
              fileKey: existing.originalFileKey,
              fileUrl: existing.originalFileUrl,
              mimeType: existing.mimeType,
            },
          ];

    const uploadedParts: UploadedPart[] = [];
    for (const part of fileParts) {
      const stored = await readInvoiceFile(part.fileKey);
      if (!stored) {
        throw new Error(
          `No se pudo leer el archivo: parte ${part.partIndex + 1}.`,
        );
      }
      uploadedParts.push({
        buffer: stored.buffer,
        mimeType: part.mimeType,
        key: part.fileKey,
        publicUrl: part.fileUrl,
      });
    }

    const [maestroCuitHintsBlock, chartAccountHintsBlock] = await Promise.all([
      loadSupplierMaestroCuitHintsBlock(userId),
      loadChartAccountHintsBlock(userId),
    ]);
    const extractOpts = { maestroCuitHintsBlock, chartAccountHintsBlock };

    const {
      extracted,
      rawOcrText,
      visionImages,
      amountsSupplement,
      discountSupplement,
    } = await extractFromParts(uploadedParts, extractOpts);

    await applyExtractionToInvoice(
      invoiceId,
      userId,
      extracted,
      rawOcrText,
      visionImages,
      amountsSupplement,
      discountSupplement,
      {
        preserveMovementId: existing.movementId,
        resetDestinationUpload: true,
      },
    );

    const [updated] = await loadSerializedBatchInvoices(userId, [invoiceId]);
    if (!updated) {
      return { ok: false, error: "No se pudo cargar la factura actualizada." };
    }

    revalidatePath("/history");
    revalidatePath("/proveedores");
    revalidatePath("/upload");
    revalidatePath(`/history/${invoiceId}`);
    return { ok: true, invoice: updated };
  } catch (e) {
    const message = formatOpenAIExtractionError(e);
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: previousStatus,
        aiPayload:
          previousAiPayload == null
            ? Prisma.JsonNull
            : (previousAiPayload as Prisma.InputJsonValue),
      },
    });
    revalidatePath("/history");
    revalidatePath("/upload");
    revalidatePath(`/history/${invoiceId}`);
    return { ok: false, error: message };
  }
}

