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

/** Lado mínimo de cada recorte de bonificaciones (alta resolución para dígitos largos). */
const DISCOUNT_CROP_MIN_SIDE_PX = 2400;

/**
 * Recorta una franja vertical [topFraction, bottomFraction) de la página, escala de grises,
 * normaliza, afila y amplía para lectura precisa de importes largos (7 dígitos).
 */
async function cropVerticalBand(
  buffer: Buffer,
  topFraction: number,
  bottomFraction: number,
): Promise<{ buffer: Buffer; mimeType: "image/png" }> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w <= 0 || h <= 0) {
    throw new Error("Imagen sin dimensiones válidas para recorte de bonificaciones.");
  }

  const top = Math.max(0, Math.floor(h * topFraction));
  const bottom = Math.min(h, Math.ceil(h * bottomFraction));
  const bandHeight = Math.max(1, bottom - top);

  let pipeline = sharp(buffer)
    .extract({ left: 0, top, width: w, height: bandHeight })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 });

  const croppedMinSide = Math.min(w, bandHeight);
  if (croppedMinSide > 0 && croppedMinSide < DISCOUNT_CROP_MIN_SIDE_PX) {
    const scale = DISCOUNT_CROP_MIN_SIDE_PX / croppedMinSide;
    pipeline = pipeline.resize(Math.round(w * scale), Math.round(bandHeight * scale), {
      kernel: sharp.kernel.lanczos3,
    });
  }

  const outBuffer = await pipeline.png().toBuffer();
  return { buffer: outBuffer, mimeType: "image/png" };
}

export type NormalizedBox = { x0: number; y0: number; x1: number; y1: number };

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Recorta una caja normalizada (0-1) con margen, escala de grises, normaliza, afila
 * y amplía agresivamente para leer importes largos con precisión.
 */
export async function cropNormalizedBox(
  buffer: Buffer,
  box: NormalizedBox,
  paddingFraction = 0.04,
): Promise<{ buffer: Buffer; mimeType: "image/png" } | null> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w <= 0 || h <= 0) return null;

  const x0 = clamp01(Math.min(box.x0, box.x1) - paddingFraction);
  const y0 = clamp01(Math.min(box.y0, box.y1) - paddingFraction);
  const x1 = clamp01(Math.max(box.x0, box.x1) + paddingFraction);
  const y1 = clamp01(Math.max(box.y0, box.y1) + paddingFraction);

  const left = Math.floor(x0 * w);
  const top = Math.floor(y0 * h);
  const cropW = Math.max(1, Math.ceil((x1 - x0) * w));
  const cropH = Math.max(1, Math.ceil((y1 - y0) * h));
  if (cropW < 8 || cropH < 8) return null;

  let pipeline = sharp(buffer)
    .extract({ left, top, width: Math.min(cropW, w - left), height: Math.min(cropH, h - top) })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 });

  const croppedMinSide = Math.min(cropW, cropH);
  if (croppedMinSide > 0 && croppedMinSide < DISCOUNT_CROP_MIN_SIDE_PX) {
    const scale = DISCOUNT_CROP_MIN_SIDE_PX / croppedMinSide;
    pipeline = pipeline.resize(Math.round(cropW * scale), Math.round(cropH * scale), {
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

/** Caja típica del bloque BONIFICACION en facturas Jeluz (centro-derecha, sobre Subtotal). */
export const DEFAULT_BONIFICACION_HEURISTIC_BOX: NormalizedBox = {
  x0: 0.45,
  y0: 0.56,
  x1: 1.0,
  y1: 0.76,
};

export async function cropDiscountHeuristicRegions(
  images: VisionImage[],
): Promise<{ buffer: Buffer; mimeType: "image/png" }[]> {
  const targetImages = pickFooterVisionImages(images);
  const crops = await Promise.all(
    targetImages.map((img) =>
      cropNormalizedBox(img.buffer, DEFAULT_BONIFICACION_HEURISTIC_BOX),
    ),
  );
  return crops.filter((c): c is { buffer: Buffer; mimeType: "image/png" } => c != null);
}

/** Fallback: dos bandas verticales ampliadas si el recorte heurístico no alcanza. */
export async function cropDiscountRegions(
  images: VisionImage[],
): Promise<{ buffer: Buffer; mimeType: "image/png" }[]> {
  const targetImages = pickFooterVisionImages(images);
  const crops = await Promise.all(
    targetImages.flatMap((img) => [
      cropVerticalBand(img.buffer, 0, 0.6),
      cropVerticalBand(img.buffer, 0.4, 1),
    ]),
  );
  return crops;
}
