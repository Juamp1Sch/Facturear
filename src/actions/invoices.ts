"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import {
  extractInvoiceData,
  extractInvoiceDataFromImage,
} from "@/lib/ai";
import type { InvoiceExtraction } from "@/lib/schemas";
import { getDefaultUserId } from "@/lib/default-user";
import { isDatabaseConfigured } from "@/lib/database-config";
import { prisma } from "@/lib/db";
import { runOcr } from "@/lib/ocr";
import { uploadBuffer } from "@/lib/storage";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);

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

function parseIsoDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
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

  if (!ALLOWED.has(file.type)) {
    throw new Error("Solo se permiten PDF, JPG o PNG.");
  }

  if (file.size > MAX_BYTES) {
    throw new Error("El archivo supera los 10 MB.");
  }

  const userId = await getDefaultUserId();
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type;
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
    let rawOcrText: string | null = null;
    let extracted: InvoiceExtraction;

    if (mimeType === "application/pdf") {
      rawOcrText = await runOcr(buffer, mimeType);
      extracted = await extractInvoiceData(rawOcrText);
    } else {
      extracted = await extractInvoiceDataFromImage(
        buffer,
        mimeType as "image/jpeg" | "image/png",
      );
    }

    const account = await resolveAccountingAccount(extracted.accounting_account);

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        rawOcrText,
        providerName: extracted.provider,
        providerCuit: extracted.cuit,
        invoiceNumber: extracted.invoice_number,
        invoiceType: extracted.invoice_type,
        invoiceDate: parseIsoDate(extracted.invoice_date),
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
        aiPayload: extracted as object,
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
