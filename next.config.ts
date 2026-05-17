import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdf-to-img", "pdfjs-dist", "xlsx", "@napi-rs/canvas"],
  // pdfjs loads @napi-rs/canvas at runtime; include native bindings in serverless bundles.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@napi-rs/canvas/**/*", "./node_modules/@napi-rs/canvas-*/**/*"],
  },
  experimental: {
    serverActions: {
      // uploadInvoice accepts files up to 10 MB (see MAX_BYTES in invoices.ts)
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
