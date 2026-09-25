import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdf-to-img", "pdfjs-dist", "xlsx", "@napi-rs/canvas", "zxing-wasm"],
  // pdfjs loads @napi-rs/canvas at runtime; include native bindings in serverless bundles.
  // zxing_reader.wasm se lee con fs en runtime (lector de QR de ARCA): el tracing no lo detecta solo.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-*/**/*",
      "./node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
    ],
  },
  experimental: {
    serverActions: {
      // uploadInvoiceBatch acepta archivos de hasta 10 MB (ver MAX_BYTES en invoices.ts)
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
