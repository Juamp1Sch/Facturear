import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "@google-cloud/vision"],
};

export default nextConfig;
