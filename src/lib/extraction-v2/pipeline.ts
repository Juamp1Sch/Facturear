import type OpenAI from "openai";
import sharp from "sharp";

import {
  configuredReasoningEffort,
  currentOpenAIModel,
  extractInvoiceDataV2,
  imageDetailForCurrentModel,
} from "@/lib/ai";
import { applyFiscalData, type ArcaFiscalData } from "@/lib/extraction-v2/arca-codes";
import { decodeArcaFiscalData, type DecodePage } from "@/lib/extraction-v2/decode-arca";
import {
  levenshtein,
  matchCuitAgainstMaestro,
  type MaestroSupplier,
} from "@/lib/extraction-v2/maestro-cuit";
import { otherTaxesOf } from "@/lib/extraction-v2/amounts-as-read";
import { crossCheckWithOcr } from "@/lib/extraction-v2/ocr-crosscheck";
import { EXTRACTION_SYSTEM_PROMPT_V2 } from "@/lib/extraction-v2/prompt";
import { resolveDocumentClassification } from "@/lib/document-class";
import {
  formatNumeroComprobante,
  parseNumeroComprobanteParts,
} from "@/lib/numero-comprobante";
import type { ExtractionReview, ReviewFieldKey, VerifiedField } from "@/lib/extraction-v2/review";
import { detectDocumentText } from "@/lib/extraction-v2/textract";
import { validateExtraction, type ReviewIssue } from "@/lib/extraction-v2/validate";
import { runOcr } from "@/lib/ocr";
import { rasterizePdfPagesPng } from "@/lib/pdf-raster";
import type { InvoiceExtractionV2, InvoiceExtractionV2Like } from "@/lib/extraction-v2/prompt";

/**
 * Pipeline de extracción v2, pensado para GPT-6 Luna (medido contra un set de referencia de
 * facturas reales: 89% de campos correctos vs 82,5% del pipeline de gpt-4o, ~2,5x más rápido):
 *
 * 1. QR / código de barras de ARCA decodificados en código → datos fiscales exactos. En
 *    paralelo, OCR de Textract de fotos y PDF escaneados (pista + segunda lectura).
 * 2. UNA llamada al modelo con el texto del PDF (o del OCR), cada página en resolución original
 *    y ampliaciones de cabecera y pie (letra chica: CUIT, número, totales, CAE).
 * 3. Validación en código (dígito verificador, suma de importes, CAE, fecha) y una 2da
 *    pasada SOLO si algo no valida, indicándole al modelo qué releer.
 * 4. Los datos del QR pisan la lectura del modelo; sin QR, el CUIT se contrasta con el
 *    maestro de proveedores.
 * 5. Lo que no se pudo verificar, o donde el OCR leyó otra cosa (CAE, número, fecha), queda
 *    marcado para revisar (aiPayload.review).
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
  extracted: InvoiceExtractionV2;
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

let warnedUnmeasuredModel = false;

const CUIT_MAX_READ_DISTANCE = 2;
const NUMBER_MAX_READ_DISTANCE = 2;
const QR_TOTAL_MISMATCH_RATIO = 0.005;
const SUM_TOLERANCE = 0.05;

/**
 * Diferencias claras entre el QR y lo impreso (según la lectura del modelo): CUIT a más de 2
 * dígitos (más que un error de OCR) o un total impreso que cierra con su propio desglose pero
 * no con el del QR.
 */
export function compareQrWithPrintedReading(
  read: InvoiceExtractionV2Like,
  qr: ArcaFiscalData,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const readCuit = (read.cuit ?? "").replace(/\D/g, "");
  if (readCuit.length === 11 && levenshtein(readCuit, qr.cuit.replace(/\D/g, "")) > CUIT_MAX_READ_DISTANCE) {
    issues.push({
      field: "cuit",
      reason: `El CUIT del QR (${qr.cuit}) no coincide con el impreso en el comprobante (${read.cuit}).`,
    });
  }
  // Mismo emisor pero otro comprobante: el número impreso difiere del QR más que un error de OCR.
  const printed = parseNumeroComprobanteParts(read.invoice_number);
  if (printed && qr.pointOfSale != null && qr.number != null) {
    const printedDigits = `${printed.puntoDeVenta}-${printed.numero}`;
    const qrDigits = `${qr.pointOfSale}-${qr.number}`;
    if (levenshtein(printedDigits, qrDigits) > NUMBER_MAX_READ_DISTANCE) {
      issues.push({
        field: "invoice_number",
        reason: `El número del QR (${formatNumeroComprobante(qr.pointOfSale, qr.number)}) no coincide con el impreso (${formatNumeroComprobante(printed.puntoDeVenta, printed.numero)}).`,
      });
    }
  }
  if (qr.total != null && read.total_amount != null && read.net_amount != null) {
    const sum =
      read.net_amount + (read.vat_amount ?? 0) + (read.perceptions_amount ?? 0) + (read.other_taxes_amount ?? 0);
    const printedCloses = Math.abs(sum - read.total_amount) <= SUM_TOLERANCE;
    const differs = Math.abs(read.total_amount - qr.total) > Math.max(SUM_TOLERANCE, qr.total * QR_TOTAL_MISMATCH_RATIO);
    if (printedCloses && differs) {
      issues.push({
        field: "amounts",
        reason: `El total impreso (${read.total_amount.toFixed(2)}) cierra con su desglose pero no coincide con el del QR (${qr.total.toFixed(2)}).`,
      });
    }
  }
  return issues;
}

/** Dependencias externas, inyectables en tests (modelo, lector de códigos y OCR). */
export type ExtractionV2Deps = {
  extract: typeof extractInvoiceDataV2;
  decode: typeof decodeArcaFiscalData;
  ocr: typeof detectDocumentText;
};

/**
 * Un remito no es un comprobante contable: los números que tenga son cantidades o precios de
 * referencia, no importes a imputar (medido: el modelo tomaba una cantidad "1" como total).
 * Se decide con la MISMA clasificación final que usa la app (`resolveDocumentClassification`):
 * si el modelo dijo "remito" pero hay CAE de factura, sigue siendo factura y conserva importes.
 */
function withoutRemitoAmounts(e: InvoiceExtractionV2, rawOcrText: string): InvoiceExtractionV2 {
  if (resolveDocumentClassification(e, rawOcrText).documentKind !== "REMITO") return e;
  return {
    ...e,
    net_amount: null,
    vat_amount: null,
    vat_lines: null,
    perceptions_amount: null,
    perception_lines: null,
    discount_amount: null,
    discount_lines: null,
    other_taxes_amount: null,
    total_amount: null,
  };
}

/** El número impreso (PV + número) coincide exactamente con el del QR. */
export function qrNumberMatchesPrint(read: InvoiceExtractionV2Like, qr: ArcaFiscalData): boolean {
  const printed = parseNumeroComprobanteParts(read.invoice_number);
  return Boolean(printed && printed.puntoDeVenta === qr.pointOfSale && printed.numero === qr.number);
}

export async function extractInvoiceV2(
  parts: ExtractionPart[],
  opts: ExtractionV2Options,
  deps: Partial<ExtractionV2Deps> = {},
): Promise<ExtractionV2Result> {
  const extract = deps.extract ?? extractInvoiceDataV2;
  const decode = deps.decode ?? decodeArcaFiscalData;
  const ocr = deps.ocr ?? detectDocumentText;
  const pages: Buffer[] = [];
  /** Fotos y páginas de PDF escaneados (sin texto embebido): las que pasan por el OCR. */
  const ocrPages: Buffer[] = [];
  const decodePages: DecodePage[] = [];
  const visionImages: VisionImage[] = [];
  const texts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.mimeType === "application/pdf") {
      const text = await runOcr(part.buffer, part.mimeType);
      const hasText = text.replace(/\s+/g, " ").trim().length >= MIN_PDF_TEXT_CHARS;
      if (hasText) {
        texts.push(`--- Parte ${i + 1} ---\n${text.slice(0, 30_000)}`);
      }
      for (const png of await rasterizePdfPagesPng(part.buffer, { scale: PDF_RENDER_SCALE })) {
        pages.push(png);
        if (!hasText) ocrPages.push(png);
        decodePages.push({ buffer: png, enlargeIfSmall: false });
        visionImages.push({ buffer: png, mimeType: "image/png" });
      }
    } else {
      pages.push(part.buffer);
      ocrPages.push(part.buffer);
      decodePages.push({ buffer: part.buffer, enlargeIfSmall: true });
      visionImages.push({ buffer: part.buffer, mimeType: part.mimeType === "image/png" ? "image/png" : "image/jpeg" });
    }
  }
  if (pages.length === 0) throw new Error("No hay páginas para procesar.");
  if (imageDetailForCurrentModel() !== "original" && !warnedUnmeasuredModel) {
    warnedUnmeasuredModel = true;
    console.warn(
      `[extraction-v2] corriendo sobre ${currentOpenAIModel()}: el pipeline v2 se midió con gpt-6-luna. Revisá OPENAI_MODEL.`,
    );
  }

  const [decoded, ocrTexts, preparedPages, headerCrop, footerCrop] = await Promise.all([
    decode(decodePages),
    ocrPages.length ? ocr(ocrPages) : Promise.resolve(null),
    Promise.all(pages.map((p) => prepareImage(p, PAGE_MIN_SIDE_PX))),
    cropBand(pages[0]!, HEADER_CROP),
    cropBand(pages[pages.length - 1]!, FOOTER_CROP),
  ]);

  const content: ContentPart[] = [];
  const rawText = texts.length ? texts.join("\n\n") : null;
  /** Lo que se devuelve como `rawOcrText` (y con lo que la app clasifica el documento). */
  const rawOcrText = rawText ?? `[${parts.length} parte(s): campos inferidos por visión.]`;
  if (rawText) {
    content.push({ type: "text", text: `Texto embebido del PDF (confiable para dígitos; usá las imágenes para ubicar cada dato):\n${rawText}` });
  }
  const ocrText = ocrTexts?.some((t) => t.trim())
    ? ocrTexts.map((t, i) => `--- Imagen ${i + 1} ---\n${t}`).join("\n\n")
    : null;
  if (ocrText) {
    console.info(`[extraction-v2] OCR Textract: ${ocrTexts!.length} imagen(es)`);
    // Pista, no verdad: el OCR también se equivoca. Medido: con esta pista Luna deja de correr
    // dígitos del CAE/número en fotos; la imagen sigue mandando.
    content.push({
      type: "text",
      text:
        "Texto leído por un OCR de las imágenes (PUEDE TENER ERRORES en dígitos). Usalo como ayuda para leer números chicos (CAE, número de comprobante, fecha, CUIT, importes), pero la imagen manda: si no coincide con lo que se ve, usá lo que se ve.\n" +
        ocrText.slice(0, 30_000),
    });
  }
  preparedPages.forEach((jpeg, i) => {
    content.push({ type: "text", text: `Página ${i + 1} completa:` });
    content.push(imagePart(jpeg));
  });
  content.push({ type: "text", text: "Ampliación de la cabecera (página 1):" });
  content.push(imagePart(headerCrop));
  content.push({ type: "text", text: `Ampliación del pie (página ${pages.length}):` });
  content.push(imagePart(footerCrop));
  // QR (host de ARCA validado) e ITF se usan recién después de contrastarlos con lo impreso: un
  // ITF puede ser otro código del papel (cupón de pago, incluso de un proveedor conocido) y un QR
  // puede estar mal generado o ser de otro comprobante.
  let fiscal: ArcaFiscalData | null = decoded && decoded.source === "QR" ? decoded : null;
  const itfCandidate = decoded && decoded.source === "ITF" ? decoded : null;
  if (decoded) {
    // Permite confirmar en los logs de Vercel que el lector de códigos funciona en producción.
    console.info(`[extraction-v2] código ARCA decodificado: ${decoded.source}`);
  }
  // Lectura CIEGA: el modelo no recibe los datos del QR/ITF. Se aplican después; así su
  // lectura de lo impreso sirve para contrastar el código (si se los pasáramos, los copiaría y
  // el contraste nunca detectaría un QR de otro comprobante ni un ITF ajeno).

  const prompt = systemPrompt(opts);
  // Los datos del QR/ITF se aplican ANTES de validar: si el modelo erró un campo que el código
  // ya trae exacto, no hace falta una 2da pasada por eso.
  // Primera pasada en "low" (medido: más razonamiento no mejora la lectura y duplica la
  // latencia); OPENAI_REASONING_EFFORT la pisa si está definido.
  const first = await extract({
    systemPrompt: prompt,
    content,
    reasoningEffort: configuredReasoningEffort() ?? "low",
    pass: "v2",
  });
  // El ITF no confirmado se acepta si el CUIT que leyó el modelo en el membrete es el mismo o
  // casi (1-2 dígitos): así se descartan códigos de barras que no son del comprobante.
  if (itfCandidate) {
    const read = (first.cuit ?? "").replace(/\D/g, "");
    if (read.length === 11 && levenshtein(read, itfCandidate.cuit.replace(/\D/g, "")) <= 2) {
      fiscal = itfCandidate;
    }
  }
  // El host del QR prueba el formato, no la autenticidad: un QR mal generado (o de otro
  // comprobante) puede traer datos que no coinciden con lo impreso. Se contrasta con la
  // primera lectura del modelo y, si difiere claramente, se marca para revisar.
  const qrMismatch = fiscal?.source === "QR" ? compareQrWithPrintedReading(first, fiscal) : [];
  // ¿Es el QR de OTRO comprobante? Sí si el número impreso difiere, o si difiere el CUIT y el
  // número no alcanza para confirmarlo. Si el número coincide, el QR es de esta factura aunque el
  // modelo haya tomado otro CUIT (p. ej. el del cliente): se aplica y solo queda marcado el CUIT.
  // Si solo difiere el total, se aplica pero sin afirmar el total.
  const numberMismatch = qrMismatch.some((i) => i.field === "invoice_number");
  const cuitMismatch = qrMismatch.some((i) => i.field === "cuit");
  const numberConfirms = fiscal ? qrNumberMatchesPrint(first, fiscal) : false;
  if (numberMismatch || (cuitMismatch && !numberConfirms)) {
    fiscal = null;
  }
  const withFiscal = (e: InvoiceExtractionV2) => (fiscal ? applyFiscalData(e, fiscal).extracted : e);

  // El reintento también es CIEGO: ve solo su propia lectura y los problemas de ESA lectura
  // (sin datos del QR). Si viera el total del QR podría inventar un desglose que cierre contra
  // él. Tampoco se reintenta por campos que el QR ya trae exactos.
  const coveredByCode = new Set<string>(
    fiscal ? applyFiscalData(first, fiscal).verifiedFields.filter((f) => f !== "total") : [],
  );
  const readIssuesOf = (e: InvoiceExtractionV2) =>
    validateExtraction(withoutRemitoAmounts(e, rawOcrText), null).filter((i) => !coveredByCode.has(i.field));
  let read = first;
  let readIssues = readIssuesOf(read);
  if (readIssues.length > 0) {
    const hints = readIssues.map((i) => `- ${i.retryHint ?? i.reason}`).join("\n");
    const retry = await extract({
      systemPrompt: prompt,
      content,
      reasoningEffort: "medium",
      pass: "v2_retry",
      followUp: `Tu extracción anterior:\n${JSON.stringify(read)}\n\nNo pasó estas validaciones:\n${hints}\n\nRevisá esas zonas del documento con máximo cuidado y devolvé la extracción completa corregida. Si el valor realmente es así en el documento, mantenelo.`,
    });
    const retryIssues = readIssuesOf(retry);
    // Se acepta solo si resuelve algo y no aparecen problemas en campos que antes estaban bien;
    // si empata, queda la primera lectura.
    const before = new Set<string>(readIssues.map((i) => i.field));
    if (retryIssues.length < readIssues.length && retryIssues.every((i) => before.has(i.field))) {
      read = retry;
      readIssues = retryIssues;
    }
  }
  let extracted = withoutRemitoAmounts(withFiscal(read), rawOcrText);

  let cuitCorrection: ExtractionReview["cuitCorrection"];
  let verifiedFields: VerifiedField[] = [];
  const extraIssues: ReviewIssue[] = [...qrMismatch];
  if (fiscal) {
    // Lo que no coincide con lo impreso no se afirma como verificado (ni manda en el match de
    // proveedor): queda aplicado del QR pero marcado para revisar.
    const mismatched = new Set<string>(qrMismatch.map((i) => (i.field === "amounts" ? "total" : i.field)));
    verifiedFields = applyFiscalData(extracted, fiscal).verifiedFields.filter((f) => !mismatched.has(f));
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
  // CAE, número y fecha contra la segunda lectura del OCR (lo que el QR trae exacto no se cruza).
  extraIssues.push(...crossCheckWithOcr(extracted, ocrText, verifiedFields));
  if (otherTaxesOf(extracted) > 0) {
    extraIssues.push({
      field: "extraction",
      reason:
        "Tiene otros tributos (impuestos internos, ITC u otros) que el JSON contable no incluye: revisá la imputación antes de enviarla al ERP.",
    });
  }
  if (!fiscal && extracted.confidence < LOW_CONFIDENCE) {
    extraIssues.push({ field: "extraction", reason: "La IA informó baja confianza en esta lectura: revisá los datos." });
  }

  const fields: Partial<Record<ReviewFieldKey, string>> = {};
  // Los motivos del cruce QR vs. impreso (en extraIssues) son los más útiles: van primero.
  const totalVerified = verifiedFields.includes("total");
  for (const issue of [...extraIssues, ...validateExtraction(extracted, totalVerified ? fiscal : null)]) {
    fields[issue.field] ??= issue.reason;
  }

  return {
    extracted,
    rawOcrText,
    visionImages,
    review: { version: 2, fields, verifiedBy: fiscal?.source ?? null, verifiedFields, cuitCorrection },
  };
}
