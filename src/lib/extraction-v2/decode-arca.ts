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
  ready ??= loadZXing().catch((err: unknown) => {
    // No cachear el fallo: en serverless la instancia sigue viva y el próximo intento puede andar.
    ready = null;
    throw err;
  });
  return ready;
}

async function loadZXing(): Promise<void> {
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
}

type Decoded = { qr: ArcaFiscalData | null; itf: ArcaFiscalData | null };

const ENLARGE_BELOW_MIN_SIDE_PX = 1800;
const ENLARGE_MAX_SIDE_PX = 4000;

/** Decodifica un bitmap RGBA. El QR tiene prioridad: trae fecha, número, letra y total. */
async function decodeRgba(img: sharp.Sharp): Promise<Decoded> {
  // toColourspace: JPG en CMYK darían 5 canales y se descartarían.
  const { data, info } = await img
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // zxing espera RGBA: con otra cantidad de canales (p. ej. grayscale() de sharp da 1) el WASM
  // lee fuera del buffer ("memory access out of bounds") y queda inutilizable.
  if (info.channels !== 4) return { qr: null, itf: null };
  const results = await readBarcodes(
    {
      // Vista sobre el mismo buffer (sin copiar ~50 MB en una página ampliada).
      data: new Uint8ClampedArray(data.buffer as ArrayBuffer, data.byteOffset, data.length),
      width: info.width,
      height: info.height,
      colorSpace: "srgb",
    },
    { formats: ["QRCode", "ITF"], tryHarder: true, tryRotate: true, maxNumberOfSymbols: 4 },
  );
  const out: Decoded = { qr: null, itf: null };
  for (const r of results) {
    if (r.format === "QRCode") out.qr ??= parseArcaQrText(r.text);
    else out.itf ??= parseArcaItfText(r.text);
  }
  return out;
}

export type DecodePage = {
  buffer: Buffer;
  /**
   * Fotos: el QR es chico (módulos de 1-2 px) y se reintenta ampliado. Las páginas de PDF ya se
   * rasterizan con buena resolución: se evita el costo de memoria y tiempo de ampliarlas.
   */
  enlargeIfSmall: boolean;
};

/**
 * Busca el QR / código de barras fiscal de ARCA en las páginas (de la última a la primera,
 * porque suele estar al pie). Un QR en cualquier página gana sobre un ITF.
 */
export async function decodeArcaFiscalData(pages: DecodePage[]): Promise<ArcaFiscalData | null> {
  let itfFallback: ArcaFiscalData | null = null;
  try {
    await ensureZXing();
    for (const page of [...pages].reverse()) {
      const oriented = await sharp(page.buffer).rotate().toBuffer();
      const direct = await decodeRgba(sharp(oriented));
      if (direct.qr) return direct.qr;
      itfFallback ??= direct.itf;

      if (!page.enlargeIfSmall) continue;
      const meta = await sharp(oriented).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      // Solo fotos chicas (típicas de WhatsApp) y con tope: una foto grande ampliada x2 en RGBA
      // pesa >100 MB y en serverless se suma a las demás imágenes en proceso.
      const scale = Math.min(2, ENLARGE_MAX_SIDE_PX / Math.max(w, h));
      if (w > 0 && h > 0 && Math.min(w, h) < ENLARGE_BELOW_MIN_SIDE_PX && scale > 1.2) {
        const enlarged = await decodeRgba(
          sharp(oriented)
            .resize(Math.round(w * scale), Math.round(h * scale), { kernel: sharp.kernel.lanczos3 })
            // En color (no grayscale): zxing necesita RGBA y la ampliación + contraste alcanza.
            .normalize()
            .sharpen({ sigma: 1.5 }),
        );
        if (enlarged.qr) return enlarged.qr;
        itfFallback ??= enlarged.itf;
      }
    }
  } catch (err) {
    // Sin QR legible se sigue solo con el modelo: nunca debe cortar la extracción.
    console.error("[extraction-v2] decodeArcaFiscalData falló", err);
  }
  return itfFallback;
}
