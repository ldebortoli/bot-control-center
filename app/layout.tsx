import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: "Bot Control Center",
  description:
    "Panel local para observar y administrar, de forma segura, una flota de bots remotos.",
  openGraph: {
    title: "Bot Control Center",
    description: "Una consola. Toda tu flota.",
    images: [{ url: "/og-bot-control-center.png", width: 1760, height: 920 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bot Control Center",
    description: "Una consola. Toda tu flota.",
    images: ["/og-bot-control-center.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
