"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type InvoiceStatus } from "@prisma/client";

import { auth } from "@/auth";
import {
  extractInvoiceData,
  extractInvoiceDataFromImage,
} from "@/lib/ai";
import type { InvoiceExtraction } from "@/lib/schemas";
import { isDatabaseConfigured } from "@/lib/database-config";
import {
  normalizeArgentineCuitFromAiOrNull,
  validateArgentineCuitForEntry,
} from "@/lib/cuit-argentina";
import { parseAiInvoiceDate } from "@/lib/invoice-calendar-date";
import { normalizeNumeroComprobanteFromAiOrNull } from "@/lib/numero-comprobante";
import { prisma } from "@/lib/db";
import { loadChartAccountHintsBlock } from "@/lib/chart-account-ai-hints";
import { resolveChartAccountForExtraction } from "@/lib/chart-account-match";
import { resolveChartAccountForSupplierCode } from "@/lib/supplier-chart-account";
import { loadSupplierMaestroCuitHintsBlock } from "@/lib/supplier-ai-hints";
import { resolveOrCreateInvoiceSupplier } from "@/lib/resolve-invoice-supplier";
import { runOcr } from "@/lib/ocr";
import { rasterizePdfFirstPagePng } from "@/lib/pdf-raster";
import { buildMovementId } from "@/lib/movement-id";
import { sumTaxLines } from "@/lib/tax-breakdown";
import { parseDocumentKind } from "@/lib/comprobante-code";
import { uploadBuffer } from "@/lib/storage";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);

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

    if (mimeType === "application/pdf") {
      const pdfText = await runOcr(buffer, mimeType);
      if (pdfEmbeddedTextIsWeak(pdfText)) {
        const pagePng = await rasterizePdfFirstPagePng(buffer);
        extracted = await extractInvoiceDataFromImage(pagePng, "image/png", extractOpts);
        rawOcrText =
          pdfText.trim().length > 0
            ? `${pdfText.slice(0, 12_000)}\n\n[PDF escaneado: campos inferidos por visión en la página 1.]`
            : "[PDF escaneado sin texto seleccionable: campos inferidos por visión en la página 1.]";
      } else {
        rawOcrText = pdfText;
        extracted = await extractInvoiceData(pdfText, extractOpts);
      }
    } else {
      extracted = await extractInvoiceDataFromImage(
        buffer,
        mimeType as "image/jpeg" | "image/png",
        extractOpts,
      );
    }

    const resolved = await resolveOrCreateInvoiceSupplier(
      userId,
      extracted.provider,
      extracted.cuit,
    );
    const aiCuit = normalizeArgentineCuitFromAiOrNull(extracted.cuit);
    const providerCuit = resolved?.cuit ?? aiCuit;
    const supplierCode = resolved?.code ?? null;

    let chartAccount =
      (await resolveChartAccountForSupplierCode(userId, supplierCode)) ??
      (await resolveChartAccountForExtraction(userId, extracted.chart_account_code, null));

    const invoiceDate = parseAiInvoiceDate(extracted.invoice_date);
    const movementId = await allocateUniqueMovementId(invoiceDate);
    const documentKind = parseDocumentKind(extracted.document_kind);

    const vatFromLines = sumTaxLines(extracted.vat_lines);
    const perceptionsFromLines = sumTaxLines(extracted.perception_lines);
    const vatAmount =
      vatFromLines ?? extracted.vat_amount;
    const perceptionsAmount =
      perceptionsFromLines ?? extracted.perceptions_amount;

    const aiPayloadOut: Record<string, unknown> = {
      ...(extracted as Record<string, unknown>),
    };
    if (supplierCode) {
      aiPayloadOut.supplier_code = supplierCode;
    }
    if (resolved?.cuit) {
      aiPayloadOut.cuit = providerCuit;
    }
    if (chartAccount) {
      aiPayloadOut.chart_account_code = chartAccount.code;
      aiPayloadOut.chart_account_name = chartAccount.name;
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        rawOcrText,
        providerName: extracted.provider,
        providerCuit,
        supplierCode,
        movementId,
        documentKind,
        invoiceNumber: normalizeNumeroComprobanteFromAiOrNull(
          extracted.invoice_number,
        ),
        invoiceType: extracted.invoice_type,
        invoiceDate,
        netAmount:
          extracted.net_amount != null
            ? new Prisma.Decimal(extracted.net_amount)
            : null,
        vatAmount:
          vatAmount != null ? new Prisma.Decimal(vatAmount) : null,
        perceptionsAmount:
          perceptionsAmount != null
            ? new Prisma.Decimal(perceptionsAmount)
            : null,
        totalAmount:
          extracted.total_amount != null
            ? new Prisma.Decimal(extracted.total_amount)
            : null,
        chartAccountId: chartAccount?.id ?? null,
        aiConfidence: extracted.confidence,
        aiPayload: aiPayloadOut as object,
        status: "READY",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
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

export type UpdateInvoiceFieldsResult =
  | { ok: true }
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

  let netAmount: Prisma.Decimal | null;
  let vatAmount: Prisma.Decimal | null;
  let perceptionsAmount: Prisma.Decimal | null;
  let totalAmount: Prisma.Decimal | null;
  try {
    netAmount = parseMoneyFromForm(formData.get("netAmount"));
    vatAmount = parseMoneyFromForm(formData.get("vatAmount"));
    perceptionsAmount = parseMoneyFromForm(formData.get("perceptionsAmount"));
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

  const resolved = await resolveOrCreateInvoiceSupplier(
    session.user.id,
    providerName,
    providerCuit,
  );
  const finalCuit = resolved?.cuit ?? providerCuit;
  const supplierCode = resolved?.code ?? null;

  const chartAccountCode = formText(formData.get("chartAccountCode"));
  let chartAccount = chartAccountCode
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
  if (chartAccount) {
    nextPayload.chart_account_code = chartAccount.code;
    nextPayload.chart_account_name = chartAccount.name;
  } else {
    delete nextPayload.chart_account_code;
    delete nextPayload.chart_account_name;
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      providerName,
      providerCuit: finalCuit,
      supplierCode,
      empresa,
      sucursal,
      documentKind,
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

  revalidatePath("/history");
  revalidatePath("/proveedores");
  revalidatePath(`/history/${invoiceId}`);
  return { ok: true };
}
