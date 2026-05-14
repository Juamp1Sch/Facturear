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
import { prisma } from "@/lib/db";
import { loadSupplierMaestroCuitHintsBlock } from "@/lib/supplier-ai-hints";
import { resolveSupplierFromMaestro } from "@/lib/supplier-match";
import { findSupplierCodeForUserCuit } from "@/lib/supplier-sync";
import { runOcr } from "@/lib/ocr";
import { rasterizePdfFirstPagePng } from "@/lib/pdf-raster";
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

async function resolveAccountingAccount(suggestedName: string | null) {
  if (!suggestedName?.trim()) return null;
  const name = suggestedName.trim();

  let acc = await prisma.accountingAccount.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (acc) return acc;

  acc = await prisma.accountingAccount.findFirst({
    where: {
      OR: [
        { name: { contains: name.slice(0, 24), mode: "insensitive" } },
        { name: { startsWith: name.slice(0, 12), mode: "insensitive" } },
      ],
    },
  });
  if (acc) return acc;

  return prisma.accountingAccount.create({
    data: {
      code: `AUTO-${Date.now().toString(36).toUpperCase()}`,
      name,
      type: "Gasto",
    },
  });
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
    const extractOpts = {
      maestroCuitHintsBlock: await loadSupplierMaestroCuitHintsBlock(userId),
    };

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

    const account = await resolveAccountingAccount(extracted.accounting_account);

    const resolved = await resolveSupplierFromMaestro(
      userId,
      extracted.provider,
      extracted.cuit,
    );
    const aiCuit = normalizeArgentineCuitFromAiOrNull(extracted.cuit);
    const providerCuit = resolved?.cuit ?? aiCuit;
    const supplierCode =
      resolved?.code ?? (await findSupplierCodeForUserCuit(userId, aiCuit));

    const aiPayloadOut: Record<string, unknown> = {
      ...(extracted as Record<string, unknown>),
    };
    if (supplierCode) {
      aiPayloadOut.supplier_code = supplierCode;
    }
    if (resolved?.cuit) {
      aiPayloadOut.cuit = providerCuit;
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        rawOcrText,
        providerName: extracted.provider,
        providerCuit,
        supplierCode,
        invoiceNumber: extracted.invoice_number,
        invoiceType: extracted.invoice_type,
        invoiceDate: parseAiInvoiceDate(extracted.invoice_date),
        netAmount:
          extracted.net_amount != null
            ? new Prisma.Decimal(extracted.net_amount)
            : null,
        vatAmount:
          extracted.vat_amount != null
            ? new Prisma.Decimal(extracted.vat_amount)
            : null,
        totalAmount:
          extracted.total_amount != null
            ? new Prisma.Decimal(extracted.total_amount)
            : null,
        accountingAccountId: account?.id ?? null,
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

  const invoiceNumber = formText(formData.get("invoiceNumber"));
  const invoiceType = formText(formData.get("invoiceType"));

  let netAmount: Prisma.Decimal | null;
  let vatAmount: Prisma.Decimal | null;
  let totalAmount: Prisma.Decimal | null;
  try {
    netAmount = parseMoneyFromForm(formData.get("netAmount"));
    vatAmount = parseMoneyFromForm(formData.get("vatAmount"));
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

  const accountingName = formText(formData.get("accountingAccountName"));
  let accountingAccountId: string | null = null;
  try {
    const acc = await resolveAccountingAccount(accountingName);
    accountingAccountId = acc?.id ?? null;
  } catch {
    return {
      ok: false,
      error: "No se pudo guardar la cuenta contable. Probá de nuevo.",
    };
  }

  const resolved = await resolveSupplierFromMaestro(
    session.user.id,
    providerName,
    providerCuit,
  );
  const finalCuit = resolved?.cuit ?? providerCuit;
  const supplierCode =
    resolved?.code ??
    (await findSupplierCodeForUserCuit(session.user.id, providerCuit));

  const nextStatus: InvoiceStatus =
    existing.status === "ERROR"
      ? "READY"
      : existing.status === "READY"
        ? "CORRECTED"
        : existing.status;

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      providerName,
      providerCuit: finalCuit,
      supplierCode,
      invoiceNumber,
      invoiceType,
      invoiceDate,
      netAmount,
      vatAmount,
      totalAmount,
      accountingAccountId,
      status: nextStatus,
    },
  });

  revalidatePath("/history");
  revalidatePath(`/history/${invoiceId}`);
  return { ok: true };
}
