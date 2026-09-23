// Required by pdfjs-dist on the server (scanned PDF → PNG). Must be a direct dependency.
import "@napi-rs/canvas";
import { pdf } from "pdf-to-img";

/** Tope de páginas que se mandan a visión por PDF (remitos largos); configurable por env. */
export const PDF_VISION_MAX_PAGES = Math.max(
  1,
  Number(process.env.PDF_VISION_MAX_PAGES ?? "6") || 6,
);

/**
 * Páginas del PDF como PNG (para PDFs escaneados sin capa de texto).
 * Si el PDF supera `maxPages`, se toman las primeras `maxPages - 1` y la ÚLTIMA,
 * porque ahí suelen estar los totales y el CAE/CAI.
 */
export async function rasterizePdfPagesPng(
  buffer: Buffer,
  options?: { scale?: number; maxPages?: number },
): Promise<Buffer[]> {
  const doc = await pdf(buffer, { scale: options?.scale ?? 3 });
  const total = doc.length;
  if (total < 1) {
    throw new Error("El PDF no tiene páginas.");
  }
  const maxPages = Math.max(1, options?.maxPages ?? PDF_VISION_MAX_PAGES);
  const pageNumbers =
    total <= maxPages
      ? Array.from({ length: total }, (_, i) => i + 1)
      : [...Array.from({ length: maxPages - 1 }, (_, i) => i + 1), total];

  const pages: Buffer[] = [];
  for (const n of pageNumbers) {
    const page = await doc.getPage(n);
    pages.push(Buffer.isBuffer(page) ? page : Buffer.from(page));
  }
  return pages;
}
