import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gradus",
    short_name: "Gradus",
    description: "Notas, asistencia, comunicados y comunicación entre la escuela y las familias.",
    lang: "es-AR",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#f6f7fb",
    theme_color: "#3b5bdb",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
