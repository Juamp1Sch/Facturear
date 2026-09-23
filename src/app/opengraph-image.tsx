import { ImageResponse } from "next/og";

export const alt = "AgileScan — Lector de facturas y remitos con IA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Preview para WhatsApp / LinkedIn / X, con los colores de marca (globals.css). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #245501 0%, #538d22 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#aad576" }}>
          AgileScan
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, lineHeight: 1.05 }}>
            Tus facturas de proveedores, cargadas con IA
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#e6f2d4" }}>
            PDF o foto → CUIT, importes, IVA, percepciones y CAE
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#aad576" }}>
          agilescan.com.ar
        </div>
      </div>
    ),
    size,
  );
}
