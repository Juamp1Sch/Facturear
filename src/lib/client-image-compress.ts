/**
 * Compresión de fotos en el navegador antes de subirlas (solo cliente).
 * OpenAI (detail "high") reduce la imagen a 2048 px de lado mayor, así que 3000 px
 * conserva de sobra la legibilidad y baja fotos de celular de 5–12 MB a < 1 MB.
 */
const MAX_LONG_SIDE_PX = 3000;
const JPEG_QUALITY = 0.88;
/** Por debajo de esto no vale la pena recomprimir (evita perder calidad sin necesidad). */
const SKIP_BELOW_BYTES = 1024 * 1024;

function isCompressibleImage(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  return (
    t === "image/jpeg" ||
    t === "image/jpg" ||
    t === "image/pjpeg" ||
    t === "image/png" ||
    /\.(jpe?g|png)$/i.test(file.name)
  );
}

export async function compressInvoiceImage(file: File): Promise<File> {
  if (!isCompressibleImage(file) || file.size < SKIP_BELOW_BYTES) return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    // "from-image" respeta la orientación EXIF de las fotos de celular.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  try {
    const longSide = Math.max(bitmap.width, bitmap.height);
    const scale = longSide > MAX_LONG_SIDE_PX ? MAX_LONG_SIDE_PX / longSide : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Fondo blanco: los PNG con transparencia quedarían negros al pasar a JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "factura";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}
