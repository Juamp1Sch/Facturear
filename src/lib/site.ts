/** URL canónica pública (producción sirve en www). Override por env para staging. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.agilescan.com.ar"
).replace(/\/+$/, "");

export const SITE_NAME = "AgileScan";

export const SITE_TITLE = "AgileScan — Lector de facturas y remitos con IA";

export const SITE_DESCRIPTION =
  "Digitalizá facturas y remitos de proveedores con IA: subí PDF o fotos y obtené CUIT, importes, IVA, percepciones y CAE listos para la carga contable. Pensado para comprobantes ARCA (ex AFIP) de Argentina.";

/** Rutas que requieren sesión: no tienen contenido público que indexar. */
export const PRIVATE_PATHS = [
  "/upload",
  "/history",
  "/proveedores",
  "/cuentas",
  "/carga-cuentas",
  "/carga-proveedores",
  "/api-config",
  "/api/",
  // Flujos de auth con códigos: sin valor para buscadores.
  "/verificar-cuenta",
  "/restablecer-contrasena",
];
