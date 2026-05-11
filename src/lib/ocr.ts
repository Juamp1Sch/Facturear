import vision from "@google-cloud/vision";

import { extractTextFromPdf } from "@/lib/pdf-text";

const MIME_PDF = "application/pdf";
const MIME_IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function runOcr(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === MIME_PDF) {
    const text = await extractTextFromPdf(buffer);
    if (text.length > 0) return text;
    return "[PDF sin capa de texto detectable; subí una foto o un PDF con texto seleccionable.]";
  }

  if (!MIME_IMAGE.has(mimeType)) {
    throw new Error(`Tipo de archivo no soportado para OCR: ${mimeType}`);
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS no está definido (ruta al JSON de la cuenta de servicio).",
    );
  }

  const client = new vision.ImageAnnotatorClient();
  const [result] = await client.documentTextDetection({
    image: { content: buffer },
  });

  const full = result.fullTextAnnotation?.text?.trim();
  if (full) return full;

  const fallback =
    result.textAnnotations?.[0]?.description?.trim() ?? "";
  return fallback;
}
