import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdf-to-img", "pdfjs-dist", "xlsx"],
};

export default nextConfig;
