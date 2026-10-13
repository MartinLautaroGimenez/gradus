import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Las planillas de importación pueden pesar hasta 2 MB (ver read-spreadsheet.ts).
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
