import type OpenAI from "openai";
import sharp from "sharp";

import { extractInvoiceDataV2, imageDetailForCurrentModel } from "@/lib/ai";
import { letterForComprobanteCode, type ArcaFiscalData } from "@/lib/extraction-v2/arca-codes";
import { decodeArcaFiscalData } from "@/lib/extraction-v2/decode-arca";
import { matchCuitAgainstMaestro, type MaestroSupplier } from "@/lib/extraction-v2/maestro-cuit";
import { EXTRACTION_SYSTEM_PROMPT_V2 } from "@/lib/extraction-v2/prompt";
import type { ExtractionReview, ReviewFieldKey } from "@/lib/extraction-v2/review";
import { validateExtraction, type ReviewIssue } from "@/lib/extraction-v2/validate";
import { runOcr } from "@/lib/ocr";
import { rasterizePdfPagesPng } from "@/lib/pdf-raster";
import type { InvoiceExtraction } from "@/lib/schemas";

/**
 * Pipeline de extracción v2, pensado para GPT-6 Luna (medido contra un set de referencia de
 * facturas reales: 89% de campos correctos vs 82,5% del pipeline de gpt-4o, ~2,5x más rápido):
 *
 * 1. QR / código de barras de ARCA decodificados en código → datos fiscales exactos.
 * 2. UNA llamada al modelo con el texto del PDF, cada página en resolución original y
 *    ampliaciones de cabecera y pie (letra chica: CUIT, número, totales, CAE).
 * 3. Validación en código (dígito verificador, suma de importes, CAE, fecha) y una 2da
 *    pasada SOLO si algo no valida, indicándole al modelo qué releer.
 * 4. Los datos del QR pisan la lectura del modelo; sin QR, el CUIT se contrasta con el
 *    maestro de proveedores.
 * 5. Lo que no se pudo verificar queda marcado para revisar (aiPayload.review).
 */

export type ExtractionPart = { buffer: Buffer; mimeType: string };
type VisionImage = { buffer: Buffer; mimeType: "image/jpeg" | "image/png" };
type ContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;

export type ExtractionV2Options = {
  maestroCuitHintsBlock: string | null;
  chartAccountHintsBlock: string | null;
  /** Proveedores del usuario con CUIT (para corregir el CUIT leído). */
  maestro: MaestroSupplier[];
};

export type ExtractionV2Result = {
  extracted: InvoiceExtraction;
  rawOcrText: string | null;
  /** Páginas originales (para pasadas focalizadas posteriores, p. ej. bonificaciones). */
  visionImages: VisionImage[];
  review: ExtractionReview;
};

const PDF_RENDER_SCALE = 2.5;
const PAGE_MIN_SIDE_PX = 2000;
const CROP_MIN_SIDE_PX = 1600;
const HEADER_CROP = [0, 0.3] as const;
const FOOTER_CROP = [0.55, 1] as const;
const MIN_PDF_TEXT_CHARS = 32;
const LOW_CONFIDENCE = 0.6;

/**
 * Agranda y realza: Luna "ve" la imagen en bloques de 32 px y con letra chica pierde o corre
 * dígitos repetidos; con lado corto ~2000 px la lectura mejora.
 */
async function prepareImage(buffer: Buffer, minSide: number): Promise<Buffer> {
  const oriented = await sharp(buffer).rotate().toBuffer();
  const meta = await sharp(oriented).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  let pipeline = sharp(oriented);
  if (w > 0 && h > 0 && Math.min(w, h) < minSide) {
    const scale = minSide / Math.min(w, h);
    pipeline = pipeline.resize(Math.round(w * scale), Math.round(h * scale), {
      kernel: sharp.kernel.lanczos3,
    });
  }
  return pipeline.normalize().sharpen({ sigma: 1 }).jpeg({ quality: 92 }).toBuffer();
}

async function cropBand(buffer: Buffer, [top, bottom]: readonly [number, number]): Promise<Buffer> {
  const oriented = await sharp(buffer).rotate().toBuffer();
  const meta = await sharp(oriented).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const t = Math.floor(h * top);
  const band = await sharp(oriented)
    .extract({ left: 0, top: t, width: w, height: Math.max(1, Math.min(h - t, Math.ceil(h * (bottom - top)))) })
    .toBuffer();
  return prepareImage(band, CROP_MIN_SIDE_PX);
}

function imagePart(jpeg: Buffer): ContentPart {
  return {
    type: "image_url",
    image_url: {
      url: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      // "original" no está en los tipos del SDK 4.x, pero la API lo acepta en GPT-5.x/6.
      detail: imageDetailForCurrentModel() as "high",
    },
  };
}

function systemPrompt(opts: ExtractionV2Options): string {
  const blocks = [opts.maestroCuitHintsBlock?.trim(), opts.chartAccountHintsBlock?.trim()].filter(
    (b): b is string => Boolean(b),
  );
  return blocks.length ? `${EXTRACTION_SYSTEM_PROMPT_V2}\n\n---\n${blocks.join("\n\n---\n")}` : EXTRACTION_SYSTEM_PROMPT_V2;
}

function applyFiscalData(e: InvoiceExtraction, fiscal: ArcaFiscalData): InvoiceExtraction {
  const out = { ...e, cuit: fiscal.cuit, fiscal_auth_type: fiscal.authType, fiscal_auth_code: fiscal.authCode };
  if (fiscal.date) out.invoice_date = fiscal.date;
  if (fiscal.pointOfSale != null && fiscal.number != null) {
    out.invoice_number = `${String(fiscal.pointOfSale).padStart(5, "0")}-${String(fiscal.number).padStart(8, "0")}`;
  }
  const letter = letterForComprobanteCode(fiscal.comprobanteCode);
  if (letter) out.invoice_type = letter;
  if (fiscal.comprobanteCode != null) out.afip_comprobante_code = String(fiscal.comprobanteCode).padStart(2, "0");
  if (fiscal.total != null) out.total_amount = fiscal.total;
  if (fiscal.currency === "DOL" && fiscal.exchangeRate != null && fiscal.exchangeRate > 1) {
    out.exchange_rate = fiscal.exchangeRate;
  }
  return out;
}

export async function extractInvoiceV2(
  parts: ExtractionPart[],
  opts: ExtractionV2Options,
): Promise<ExtractionV2Result> {
  const pages: Buffer[] = [];
  const visionImages: VisionImage[] = [];
  const texts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.mimeType === "application/pdf") {
      const text = await runOcr(part.buffer, part.mimeType);
      if (text.replace(/\s+/g, " ").trim().length >= MIN_PDF_TEXT_CHARS) {
        texts.push(`--- Parte ${i + 1} ---\n${text.slice(0, 30_000)}`);
      }
      for (const png of await rasterizePdfPagesPng(part.buffer, { scale: PDF_RENDER_SCALE })) {
        pages.push(png);
        visionImages.push({ buffer: png, mimeType: "image/png" });
      }
    } else {
      pages.push(part.buffer);
      visionImages.push({ buffer: part.buffer, mimeType: part.mimeType === "image/png" ? "image/png" : "image/jpeg" });
    }
  }
  if (pages.length === 0) throw new Error("No hay páginas para procesar.");

  const [fiscal, preparedPages, headerCrop, footerCrop] = await Promise.all([
    decodeArcaFiscalData(pages),
    Promise.all(pages.map((p) => prepareImage(p, PAGE_MIN_SIDE_PX))),
    cropBand(pages[0]!, HEADER_CROP),
    cropBand(pages[pages.length - 1]!, FOOTER_CROP),
  ]);

  const content: ContentPart[] = [];
  const rawText = texts.length ? texts.join("\n\n") : null;
  if (rawText) {
    content.push({ type: "text", text: `Texto embebido del PDF (confiable para dígitos; usá las imágenes para ubicar cada dato):\n${rawText}` });
  }
  preparedPages.forEach((jpeg, i) => {
    content.push({ type: "text", text: `Página ${i + 1} completa:` });
    content.push(imagePart(jpeg));
  });
  content.push({ type: "text", text: "Ampliación de la cabecera (página 1):" });
  content.push(imagePart(headerCrop));
  content.push({ type: "text", text: `Ampliación del pie (página ${pages.length}):` });
  content.push(imagePart(footerCrop));
  if (fiscal) {
    content.push({
      type: "text",
      text: `Datos decodificados por software del ${fiscal.source === "QR" ? "QR" : "código de barras"} fiscal de ARCA de este comprobante (exactos, usalos como verdad): ${JSON.stringify(fiscal)}`,
    });
  }

  const prompt = systemPrompt(opts);
  let extracted = await extractInvoiceDataV2({ systemPrompt: prompt, content, reasoningEffort: "low", pass: "v2" });
  let issues = validateExtraction(extracted, fiscal);

  if (issues.length > 0) {
    const hints = issues.map((i) => `- ${i.retryHint ?? i.reason}`).join("\n");
    const retry = await extractInvoiceDataV2({
      systemPrompt: prompt,
      content,
      reasoningEffort: "medium",
      pass: "v2_retry",
      followUp: `Tu extracción anterior:\n${JSON.stringify(extracted)}\n\nNo pasó estas validaciones:\n${hints}\n\nRevisá esas zonas del documento con máximo cuidado y devolvé la extracción completa corregida. Si el valor realmente es así en el documento, mantenelo.`,
    });
    const retryIssues = validateExtraction(retry, fiscal);
    if (retryIssues.length <= issues.length) {
      extracted = retry;
      issues = retryIssues;
    }
  }

  let cuitCorrection: ExtractionReview["cuitCorrection"];
  const extraIssues: ReviewIssue[] = [];
  if (fiscal) {
    extracted = applyFiscalData(extracted, fiscal);
  } else if (opts.maestro.length > 0 && extracted.cuit) {
    const match = matchCuitAgainstMaestro(opts.maestro, extracted.cuit, extracted.provider);
    if (match.status === "corrected") {
      cuitCorrection = { from: extracted.cuit, to: match.cuit, supplierName: match.supplierName };
      extracted = { ...extracted, cuit: match.cuit };
    } else if (match.status === "unknown") {
      extraIssues.push({
        field: "cuit",
        reason: "El CUIT leído no está en tu maestro de proveedores: puede ser un proveedor nuevo o un dígito mal leído.",
      });
    }
  }
  if (!fiscal && !extracted.cuit && extracted.document_kind && extracted.document_kind !== "PRESUPUESTO") {
    extraIssues.push({ field: "cuit", reason: "No se encontró el CUIT del emisor en el comprobante." });
  }
  if (!fiscal && extracted.confidence < LOW_CONFIDENCE) {
    extraIssues.push({ field: "extraction", reason: "La IA informó baja confianza en esta lectura: revisá los datos." });
  }

  const fields: Partial<Record<ReviewFieldKey, string>> = {};
  for (const issue of [...validateExtraction(extracted, fiscal), ...extraIssues]) {
    fields[issue.field] ??= issue.reason;
  }

  return {
    extracted,
    rawOcrText: rawText ?? `[${parts.length} parte(s): campos inferidos por visión.]`,
    visionImages,
    review: { version: 2, fields, verifiedBy: fiscal?.source ?? null, cuitCorrection },
  };
}
