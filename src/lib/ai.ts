import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import { invoiceExtractionSchema, fiscalAuthSupplementSchema, type InvoiceExtraction } from "@/lib/schemas";

export type InvoiceExtractOptions = {
  /** Proveedores del maestro con CUIT; solo si hay datos, se añade al system prompt. */
  maestroCuitHintsBlock?: string | null;
  /** Plan de cuentas importado; la IA elige chart_account_code de esta lista. */
  chartAccountHintsBlock?: string | null;
};

const EXTRACTION_RULES = `- Montos: números en pesos (sin símbolo). Si hay varios totales, elegí el total final a pagar.
- CUIT del EMISOR (campo "cuit"): SOLO el de la CABECERA / membrete / bloque fiscal del PROVEEDOR (arriba del documento, junto al nombre del emisor). Contá exactamente 11 dígitos y devolvé XX-XXXXXXXX-X. NUNCA uses el CUIT del cliente, destinatario, alumno ni el del cuerpo bajo "Consumidor final". Si hay dos CUITs, siempre el del encabezado del emisor. Si en cabecera se leen 11 dígitos claros (aunque haya otro CUIT abajo), devolvé esos 11 dígitos formateados: NO uses null solo por dudar del dígito verificador AFIP ni por existencia de otro CUIT en el cuerpo.
- invoice_number: si el encabezado AFIP muestra "Punto de Venta" / "Punto de Vta" y "Número" / "Comp. Nro" (típicamente arriba a la derecha, junto a FACTURA A/B/C), combiná ambos en NNNNN-NNNNNNNN (5 dígitos PV + guion + 8 dígitos número, con ceros a la izquierda; ej. PV 00004 y Nro 00059991 → 00004-00059991). No confundir con CAE, OC, códigos de ítem ni número de cliente. Si solo hay un número sin punto de venta, devolvé ese valor sin inventar PV.
- Fecha: ISO YYYY-MM-DD.
- invoice_type: letra del comprobante (A, B, C, M, E) si aparece.
- afip_comprobante_code: el CÓDIGO DE COMPROBANTE AFIP/ARCA impreso en el documento. En comprobantes fiscales suele ser un recuadro "Cód. NN" / "Código NN" (1 a 3 dígitos) ubicado junto a la letra grande A/B/C (típicamente en el centro o arriba del comprobante; ej. 01, 06, 011). Devolvé SOLO ese número si está realmente impreso como código de comprobante AFIP. Devolvé null si es un presupuesto, nota de pedido, parte diario, remito interno, orden de compra o cualquier documento que NO tenga ese recuadro de código AFIP. NUNCA lo confundas con el número de comprobante, CAE/CAI/CAEA, punto de venta, código de artículo, número de cliente ni teléfono. Ante la duda, null.
- fiscal_auth_type y fiscal_auth_code: autorización fiscal distinta del código de comprobante AFIP. Buscá en el PIE o esquina inferior del documento:
  • CAE: texto "CAE N°" / "CAE:" con número y "Vto. CAE" / "Fecha Vto. CAE" (facturas electrónicas).
  • CAEA: texto "CAEA" con número de autorización (comprobantes con CAEA).
  • CAI: texto "CAI:" con número y "Fecha Vencimiento" (remitos fiscales de imprenta, facturas en papel autorizadas; revisá SIEMPRE el pie y la esquina inferior derecha — suele verse como "CAI: 52076217180318 - Fecha Vencimiento: DD/MM/AAAA").
  • TICKET_FISCAL: comprobante de controlador fiscal ("C.F.", "Controlador Fiscal", "TIQUE", "Tique Factura", código de barras fiscal de ticket).
  Devolvé fiscal_auth_type según lo que encuentres y fiscal_auth_code con el número (CAE/CAEA/CAI). Para TICKET_FISCAL, fiscal_auth_code = null. Si no hay ninguna autorización fiscal legible, ambos null. NO confundir CAE/CAI con número de comprobante ni con código AFIP.
- document_kind: tipo según encabezado — "FACTURA", "NOTA_CREDITO", "NOTA_DEBITO", "REMITO" (si dice REMITO / letra R en recuadro), "PRESUPUESTO" (presupuesto, nota de pedido, parte diario, orden interna SIN CAE/CAI/CAEA ni código AFIP). Si hay CAE, CAI o CAEA, NO es PRESUPUESTO.
- chart_account_code: si se incluye el plan de cuentas del usuario, elegí el código de la cuenta (efectivo, banco, mercado pago, etc.) que corresponda al medio de pago o imputación visible en la factura; si no hay plan o no hay señal, null.
- Desglose fiscal (pie de factura / tabla de impuestos / totales): leé cada renglón por separado.
- vat_lines: cada fila de IVA con label (ej. "IVA 21%", "IVA 10,5%") y amount. Si hay un solo importe de IVA, un solo elemento. null si no hay IVA.
- vat_amount: suma de los amount de vat_lines, o el único importe de IVA si no hay desglose.
- perception_lines: cada percepción impositiva con label (ej. "Percepción IIBB", "Per. IVA") y amount. null si no hay percepciones.
- perceptions_amount: suma de los amount de perception_lines, o el total de percepciones si no hay desglose.
Para el resto de campos: si un dato no está en el texto o no es legible en la imagen, devolvé null. Para "cuit", solo null si en la cabecera del emisor no hay ningún CUIT legible. confidence: qué tan seguro estás de los montos y el proveedor (0 a 1).`;

const SYSTEM_PROMPT_TEXT = `Sos un asistente contable para Argentina. A partir del texto OCR de una factura de proveedor, extraé campos estructurados.
${EXTRACTION_RULES}`;

const SYSTEM_PROMPT_VISION = `Sos un asistente contable para Argentina. A partir de la imagen de una factura de proveedor, leé el comprobante y extraé los mismos campos estructurados.
${EXTRACTION_RULES}`;

function buildSystemPrompt(base: string, options: InvoiceExtractOptions): string {
  const blocks = [
    options.maestroCuitHintsBlock?.trim(),
    options.chartAccountHintsBlock?.trim(),
  ].filter((b): b is string => Boolean(b));
  if (blocks.length === 0) return base;
  return `${base}\n\n---\n${blocks.join("\n\n---\n")}`;
}

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY no está definido.");
  }
  return new OpenAI({ apiKey });
}

export async function extractInvoiceData(
  rawOcrText: string,
  options: InvoiceExtractOptions = {},
): Promise<InvoiceExtraction> {
  const openai = getOpenAI();
  const trimmed = rawOcrText.slice(0, 48_000);
  const systemContent = buildSystemPrompt(SYSTEM_PROMPT_TEXT, options);

  const completion = await openai.beta.chat.completions.parse({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `Texto OCR de la factura. Para "cuit" usá solo el CUIT del EMISOR en cabecera/membrete (11 dígitos); ignorá CUITs de cliente o receptor en el cuerpo del texto. Para "invoice_number", si hay Punto de Venta y Número en cabecera, devolvé NNNNN-NNNNNNNN (ej. 00004-00059991).\n\n${trimmed}`,
      },
    ],
    response_format: zodResponseFormat(
      invoiceExtractionSchema,
      "invoice_extraction",
    ),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("OpenAI no devolvió datos parseables.");
  }
  return parsed;
}

export async function extractInvoiceDataFromImage(
  buffer: Buffer,
  mimeType: "image/jpeg" | "image/png",
  options: InvoiceExtractOptions = {},
): Promise<InvoiceExtraction> {
  const openai = getOpenAI();
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const systemContent = buildSystemPrompt(SYSTEM_PROMPT_VISION, options);

  const completion = await openai.beta.chat.completions.parse({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extraé los datos estructurados de esta factura (imagen). Para el campo cuit usá únicamente el CUIT del EMISOR en la cabecera del comprobante (bloque superior del vendedor); ignorá CUITs de cliente o receptor en el medio o abajo del documento. Para invoice_number, si en cabecera (arriba a la derecha) hay Punto de Venta y Número, combiná en NNNNN-NNNNNNNN (ej. 00004-00059991).",
          },
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" },
          },
        ],
      },
    ],
    response_format: zodResponseFormat(
      invoiceExtractionSchema,
      "invoice_extraction",
    ),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("OpenAI no devolvió datos parseables.");
  }
  return parsed;
}

const FISCAL_AUTH_VISION_PROMPT = `Sos un asistente contable para Argentina. Tu ÚNICA tarea es leer la autorización fiscal impresa en el PIE o ESQUINA INFERIOR del comprobante (últimos 15% de la página).

Buscá específicamente:
- CAI: texto "CAI:" seguido de un número largo (10-20 dígitos), a menudo junto a "Fecha Vencimiento" o "Vto. CAI". Muy común en remitos fiscales (letra R) en la esquina inferior derecha.
- CAE: "CAE N°" / "CAE:" con número y "Vto. CAE" (facturas electrónicas).
- CAEA: "CAEA" con número.
- TICKET_FISCAL: controlador fiscal ("C.F.", "TIQUE").

Devolvé fiscal_auth_type y fiscal_auth_code. Si no hay ninguna autorización legible en el pie, ambos null.`;

/**
 * Segunda pasada de visión solo para CAE/CAEA/CAI cuando la extracción principal no los detectó.
 * Necesaria en fotos/escaneos donde no hay texto OCR embebido.
 */
export async function supplementFiscalAuthFromImages(
  images: { buffer: Buffer; mimeType: "image/jpeg" | "image/png" }[],
): Promise<{ fiscal_auth_type: InvoiceExtraction["fiscal_auth_type"]; fiscal_auth_code: string | null } | null> {
  if (images.length === 0) return null;

  const openai = getOpenAI();
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: "Enfocate en el pie de página y la esquina inferior derecha. ¿Hay CAE, CAEA o CAI impreso? Devolvé fiscal_auth_type y fiscal_auth_code.",
    },
    ...images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.buffer.toString("base64")}`,
        detail: "high" as const,
      },
    })),
  ];

  const completion = await openai.beta.chat.completions.parse({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: FISCAL_AUTH_VISION_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: zodResponseFormat(
      fiscalAuthSupplementSchema,
      "fiscal_auth_supplement",
    ),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed?.fiscal_auth_type) return null;
  return {
    fiscal_auth_type: parsed.fiscal_auth_type,
    fiscal_auth_code: parsed.fiscal_auth_code,
  };
}

export async function extractInvoiceDataFromImages(
  images: { buffer: Buffer; mimeType: "image/jpeg" | "image/png" }[],
  options: InvoiceExtractOptions = {},
): Promise<InvoiceExtraction> {
  if (images.length === 0) {
    throw new Error("Se requiere al menos una imagen para la extracción.");
  }
  if (images.length === 1) {
    return extractInvoiceDataFromImage(
      images[0]!.buffer,
      images[0]!.mimeType,
      options,
    );
  }

  const openai = getOpenAI();
  const systemContent = buildSystemPrompt(SYSTEM_PROMPT_VISION, options);
  const partLabels = images.map((_, i) => `parte ${i + 1}`).join(", ");

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Estas ${images.length} imágenes (${partLabels}) son partes de un mismo comprobante de factura. Combiná la información de todas las páginas en una única extracción estructurada. Para el campo cuit usá únicamente el CUIT del EMISOR en la cabecera del comprobante. Para invoice_number, si en cabecera hay Punto de Venta y Número, combiná en NNNNN-NNNNNNNN.`,
    },
    ...images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.buffer.toString("base64")}`,
        detail: "high" as const,
      },
    })),
  ];

  const completion = await openai.beta.chat.completions.parse({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    response_format: zodResponseFormat(
      invoiceExtractionSchema,
      "invoice_extraction",
    ),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("OpenAI no devolvió datos parseables.");
  }
  return parsed;
}
