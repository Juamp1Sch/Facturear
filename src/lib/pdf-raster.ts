import { pdf } from "pdf-to-img";

/** Primera página del PDF como PNG (para PDFs escaneados sin capa de texto). */
export async function rasterizePdfFirstPagePng(
  buffer: Buffer,
  options?: { scale?: number },
): Promise<Buffer> {
  const doc = await pdf(buffer, { scale: options?.scale ?? 2 });
  if (doc.length < 1) {
    throw new Error("El PDF no tiene páginas.");
  }
  const page = await doc.getPage(1);
  return Buffer.isBuffer(page) ? page : Buffer.from(page);
}
