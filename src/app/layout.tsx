import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Gradus", template: "%s · Gradus" },
  description: "Notas, asistencia, comunicados y comunicación entre la escuela y las familias.",
  applicationName: "Gradus",
  appleWebApp: { capable: true, title: "Gradus", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#3b5bdb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f19" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
