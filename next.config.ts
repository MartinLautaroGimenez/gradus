import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // No anunciar qué tecnología usa el servidor.
  poweredByHeader: false,
  experimental: {
    // Adjuntos de comunicados: hasta 5 archivos de 10 MB (ver src/lib/storage.ts).
    serverActions: { bodySizeLimit: "52mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }];
  },
};

export default nextConfig;
