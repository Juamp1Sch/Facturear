import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import { invoiceExtractionSchema, type InvoiceExtraction } from "@/lib/schemas";

const SYSTEM_PROMPT = `Sos un asistente contable para Argentina. A partir del texto OCR de una factura de proveedor, extraé campos estructurados.
- Montos: números en pesos (sin símbolo). Si hay varios totales, elegí el total final a pagar.
- CUIT: normalizá a formato XX-XXXXXXXX-X si podés inferir los dígitos.
- Fecha: ISO YYYY-MM-DD.
- invoice_type: letra del comprobante (A, B, C, M, E) si aparece.
- accounting_account: sugerí una categoría en español coherente con el rubro del proveedor (ej. Servicios de Telecomunicaciones).
Si un dato no está en el texto, devolvé null para ese campo. confidence: qué tan seguro estás de los montos y el proveedor (0 a 1).`;

export async function extractInvoiceData(
  rawOcrText: string,
): Promise<InvoiceExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY no está definido.");
  }

  const openai = new OpenAI({ apiKey });
  const trimmed = rawOcrText.slice(0, 48_000);

  const completion = await openai.beta.chat.completions.parse({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Texto OCR de la factura:\n\n${trimmed}`,
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
