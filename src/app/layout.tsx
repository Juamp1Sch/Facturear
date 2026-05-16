import type { Metadata } from "next";
import { JetBrains_Mono, Nunito } from "next/font/google";

import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Facturear — Facturas de proveedores",
  description:
    "Subí facturas (PDF o foto): visión OpenAI en fotos, texto en PDF y extracción con IA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${nunito.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col overflow-x-hidden" suppressHydrationWarning>
        <SiteHeader />
        <div className="flex w-full min-w-0 flex-1 flex-col items-center">
          {children}
        </div>
      </body>
    </html>
  );
}
