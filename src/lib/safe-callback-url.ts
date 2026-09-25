const DEFAULT_AFTER_LOGIN = "/upload";

/**
 * Destino post-login a partir de un valor del cliente: solo rutas internas
 * ("/history/123?x=1"). Nunca URLs absolutas, "//host" ni "/\host" (open redirect).
 */
export function safeCallbackUrl(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_AFTER_LOGIN;
  const v = raw.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  // Caracteres de control (p. ej. "/\t/evil.com") los normalizan los navegadores a "//".
  if (/[\u0000-\u001f\u007f]/.test(v)) return DEFAULT_AFTER_LOGIN;
  return v;
}
