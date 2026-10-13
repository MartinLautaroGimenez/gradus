import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Adjuntos de comunicados: hasta 5 archivos de 10 MB (ver src/lib/storage.ts).
    serverActions: { bodySizeLimit: "52mb" },
  },
};

export default nextConfig;
