import { extractTextFromPdf } from "@/lib/pdf-text";

const MIME_PDF = "application/pdf";

/** Texto embebido en PDF (sin OCR de imágenes; los escaneados van a visión en `extractFromParts`). */
export async function runOcr(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === MIME_PDF) {
    return extractTextFromPdf(buffer);
  }

  throw new Error(`runOcr solo acepta PDF; recibido: ${mimeType}`);
}
