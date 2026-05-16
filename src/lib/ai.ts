import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import { invoiceExtractionSchema, type InvoiceExtraction } from "@/lib/schemas";

export type InvoiceExtractOptions = {
  /** Proveedores del maestro con CUIT; solo si hay datos, se añade al system prompt. */
  maestroCuitHintsBlock?: string | null;
  /** Plan de cuentas importado; la IA elige chart_account_code de esta lista. */
  chartAccountHintsBlock?: string | null;
};

const EXTRACTION_RULES = `- Montos: números en pesos (sin símbolo). Si hay varios totales, elegí el total final a pagar.
- CUIT del EMISOR (campo "cuit"): SOLO el de la CABECERA / membrete / bloque fiscal del PROVEEDOR (arriba del documento, junto al nombre del emisor). Contá exactamente 11 dígitos y devolvé XX-XXXXXXXX-X. NUNCA uses el CUIT del cliente, destinatario, alumno ni el del cuerpo bajo "Consumidor final". Si hay dos CUITs, siempre el del encabezado del emisor. Si en cabecera se leen 11 dígitos claros (aunque haya otro CUIT abajo), devolvé esos 11 dígitos formateados: NO uses null solo por dudar del dígito verificador AFIP ni por existencia de otro CUIT en el cuerpo.
- Fecha: ISO YYYY-MM-DD.
- invoice_type: letra del comprobante (A, B, C, M, E) si aparece.
- chart_account_code: si se incluye el plan de cuentas del usuario, elegí el código de la cuenta (efectivo, banco, mercado pago, etc.) que corresponda al medio de pago o imputación visible en la factura; si no hay plan o no hay señal, null.
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
        content: `Texto OCR de la factura. Para "cuit" usá solo el CUIT del EMISOR en cabecera/membrete (11 dígitos); ignorá CUITs de cliente o receptor en el cuerpo del texto.\n\n${trimmed}`,
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
            text: "Extraé los datos estructurados de esta factura (imagen). Para el campo cuit usá únicamente el CUIT del EMISOR en la cabecera del comprobante (bloque superior del vendedor); ignorá CUITs de cliente o receptor en el medio o abajo del documento.",
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
