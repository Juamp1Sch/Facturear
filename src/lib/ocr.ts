import { extractTextFromPdf } from "@/lib/pdf-text";

const MIME_PDF = "application/pdf";

/** Texto embebido en PDF (imágenes/JPEG se procesan con visión en OpenAI). */
export async function runOcr(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === MIME_PDF) {
    const text = await extractTextFromPdf(buffer);
    if (text.length > 0) return text;
    return "[PDF sin capa de texto detectable; subí una foto o un PDF con texto seleccionable.]";
  }

  throw new Error(`runOcr solo acepta PDF; recibido: ${mimeType}`);
}
