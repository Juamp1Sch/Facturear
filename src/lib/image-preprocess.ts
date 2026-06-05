import sharp from "sharp";

const MIN_SIDE_PX = 1600;
/** Lado mínimo del recorte ampliado del recuadro de totales. */
const TOTALS_CROP_MIN_SIDE_PX = 2200;
/** Fracción inferior de la página a recortar (totales + caja lateral). */
const TOTALS_CROP_BOTTOM_FRACTION = 0.5;

export async function preprocessInvoiceImage(
  buffer: Buffer,
  mimeType: "image/jpeg" | "image/png",
): Promise<{ buffer: Buffer; mimeType: "image/jpeg" | "image/png" }> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const minSide = Math.min(w, h);

  let pipeline = sharp(buffer).normalize().sharpen({ sigma: 1 });

  if (minSide > 0 && minSide < MIN_SIDE_PX) {
    const scale = MIN_SIDE_PX / minSide;
    pipeline = pipeline.resize(Math.round(w * scale), Math.round(h * scale), {
      kernel: sharp.kernel.lanczos3,
    });
  }

  const outBuffer =
    mimeType === "image/png"
      ? await pipeline.png().toBuffer()
      : await pipeline.jpeg({ quality: 95 }).toBuffer();

  return { buffer: outBuffer, mimeType };
}

export async function preprocessVisionImages(
  images: { buffer: Buffer; mimeType: "image/jpeg" | "image/png" }[],
): Promise<{ buffer: Buffer; mimeType: "image/jpeg" | "image/png" }[]> {
  return Promise.all(
    images.map((img) => preprocessInvoiceImage(img.buffer, img.mimeType)),
  );
}

/**
 * Recorta la franja inferior (recuadro de totales + caja lateral), escala de grises,
 * normaliza contraste y amplía para lectura precisa de dígitos (6 vs 4).
 */
export async function cropTotalsRegion(
  buffer: Buffer,
  _mimeType: "image/jpeg" | "image/png",
): Promise<{ buffer: Buffer; mimeType: "image/png" }> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w <= 0 || h <= 0) {
    throw new Error("Imagen sin dimensiones válidas para recorte de totales.");
  }

  const cropTop = Math.max(0, Math.floor(h * (1 - TOTALS_CROP_BOTTOM_FRACTION)));
  const cropHeight = h - cropTop;

  let pipeline = sharp(buffer)
    .extract({ left: 0, top: cropTop, width: w, height: cropHeight })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 });

  const croppedMinSide = Math.min(w, cropHeight);
  if (croppedMinSide > 0 && croppedMinSide < TOTALS_CROP_MIN_SIDE_PX) {
    const scale = TOTALS_CROP_MIN_SIDE_PX / croppedMinSide;
    pipeline = pipeline.resize(Math.round(w * scale), Math.round(cropHeight * scale), {
      kernel: sharp.kernel.lanczos3,
    });
  }

  const outBuffer = await pipeline.png().toBuffer();
  return { buffer: outBuffer, mimeType: "image/png" };
}

export type VisionImage = { buffer: Buffer; mimeType: "image/jpeg" | "image/png" };

/** Totales y CAE están en la última parte; evita mandar todas las páginas a la 2da pasada. */
export function pickFooterVisionImages(
  images: VisionImage[],
): VisionImage[] {
  if (images.length <= 1) return images;
  return [images[images.length - 1]!];
}

export async function cropTotalsRegions(
  images: VisionImage[],
): Promise<{ buffer: Buffer; mimeType: "image/png" }[]> {
  const footerImages = pickFooterVisionImages(images);
  return Promise.all(
    footerImages.map((img) => cropTotalsRegion(img.buffer, img.mimeType)),
  );
}
