import { readFile } from "fs/promises";
import path from "path";

import sharp from "sharp";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

import {
  parseArcaItfText,
  parseArcaQrText,
  type ArcaFiscalData,
} from "@/lib/extraction-v2/arca-codes";

let ready: Promise<void> | null = null;

/** Carga el .wasm desde node_modules (sin descargarlo de un CDN en runtime). */
function ensureZXing(): Promise<void> {
  ready ??= (async () => {
    const wasmPath = path.join(
      process.cwd(),
      "node_modules",
      "zxing-wasm",
      "dist",
      "reader",
      "zxing_reader.wasm",
    );
    const bin = await readFile(wasmPath);
    const wasmBinary = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
    await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
  })();
  return ready;
}

async function decodeOnce(image: Buffer): Promise<ArcaFiscalData | null> {
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const results = await readBarcodes(
    { data: new Uint8ClampedArray(data), width: info.width, height: info.height, colorSpace: "srgb" },
    { formats: ["QRCode", "ITF"], tryHarder: true, tryRotate: true, maxNumberOfSymbols: 3 },
  );
  for (const r of results) {
    const parsed = r.format === "QRCode" ? parseArcaQrText(r.text) : parseArcaItfText(r.text);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Busca el QR / código de barras fiscal de ARCA en las páginas (de la última a la primera,
 * porque suele estar al pie). En fotos el QR es chico: se reintenta ampliado y con contraste.
 */
export async function decodeArcaFiscalData(pages: Buffer[]): Promise<ArcaFiscalData | null> {
  try {
    await ensureZXing();
    for (const page of [...pages].reverse()) {
      const oriented = await sharp(page).rotate().toBuffer();
      const direct = await decodeOnce(oriented);
      if (direct) return direct;
      const meta = await sharp(oriented).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (w > 0 && h > 0 && Math.min(w, h) < 2500) {
        const enlarged = await sharp(oriented)
          .resize(w * 2, h * 2, { kernel: sharp.kernel.lanczos3 })
          .grayscale()
          .normalize()
          .sharpen({ sigma: 1.5 })
          .png()
          .toBuffer();
        const retry = await decodeOnce(enlarged);
        if (retry) return retry;
      }
    }
  } catch (err) {
    // Sin QR legible se sigue solo con el modelo: nunca debe cortar la extracción.
    console.error("[extraction-v2] decodeArcaFiscalData falló", err);
  }
  return null;
}
