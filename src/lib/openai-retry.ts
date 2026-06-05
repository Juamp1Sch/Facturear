import OpenAI from "openai";

const MAX_RETRIES = 6;

function parseRetryAfterMs(message: string): number | null {
  const m = message.match(/try again in ([\d.]+)s/i);
  if (!m?.[1]) return null;
  const seconds = Number(m[1]);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.ceil(seconds * 1000);
}

export function isOpenAIRateLimitError(err: unknown): boolean {
  if (err instanceof OpenAI.APIError && err.status === 429) return true;
  if (err instanceof Error) {
    return (
      err.message.includes("429") ||
      /\brate limit\b/i.test(err.message)
    );
  }
  return false;
}

/** Mensaje legible cuando la extracción falla por límite de OpenAI. */
export function formatOpenAIExtractionError(err: unknown): string {
  if (isOpenAIRateLimitError(err)) {
    return (
      "Límite de uso de OpenAI alcanzado (demasiadas solicitudes o tokens por minuto). " +
      "Esperá unos segundos y reintentá subiendo esta factura sola, o menos archivos por lote."
    );
  }
  return err instanceof Error ? err.message : "Error desconocido";
}

/**
 * Reintenta llamadas a OpenAI ante 429, respetando el tiempo indicado en el error.
 */
export async function withOpenAIRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isOpenAIRateLimitError(err) || attempt >= MAX_RETRIES - 1) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const waitMs =
        parseRetryAfterMs(msg) ?? Math.min(3000 * 2 ** attempt, 60_000);
      await new Promise((resolve) => setTimeout(resolve, waitMs + 300));
    }
  }
  throw lastError;
}
