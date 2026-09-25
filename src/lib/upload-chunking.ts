/**
 * Vercel corta cualquier request a una función en 4,5 MB (413 FUNCTION_PAYLOAD_TOO_LARGE),
 * sin importar `bodySizeLimit`. Dejamos margen para el overhead multipart del Server Action.
 */
export const UPLOAD_REQUEST_MAX_BYTES = 4 * 1024 * 1024;

/** Facturas por request: acota la duración de cada invocación (timeouts de la función). */
export const UPLOAD_REQUEST_MAX_INVOICES = 3;

export type UploadChunk = {
  /** Índices de archivo (sobre la lista original) de cada factura de este request. */
  groups: number[][];
  bytes: number;
};

/**
 * Reparte las facturas (grupos de archivos) en requests que respeten el límite de bytes
 * y de facturas por request, manteniendo el orden. Una factura nunca se parte entre requests.
 * Devuelve `oversized` con las facturas que por sí solas superan el límite.
 */
export function packUploadChunks(
  groups: number[][],
  fileSizes: number[],
  opts: { maxBytes?: number; maxInvoices?: number } = {},
): { chunks: UploadChunk[]; oversized: number[][] } {
  const maxBytes = opts.maxBytes ?? UPLOAD_REQUEST_MAX_BYTES;
  const maxInvoices = Math.max(1, opts.maxInvoices ?? UPLOAD_REQUEST_MAX_INVOICES);
  const chunks: UploadChunk[] = [];
  const oversized: number[][] = [];
  let current: UploadChunk = { groups: [], bytes: 0 };

  for (const group of groups) {
    const bytes = group.reduce((sum, idx) => sum + (fileSizes[idx] ?? 0), 0);
    if (bytes > maxBytes) {
      oversized.push(group);
      continue;
    }
    const fits =
      current.groups.length < maxInvoices && current.bytes + bytes <= maxBytes;
    if (!fits && current.groups.length > 0) {
      chunks.push(current);
      current = { groups: [], bytes: 0 };
    }
    current.groups.push(group);
    current.bytes += bytes;
  }
  if (current.groups.length > 0) chunks.push(current);
  return { chunks, oversized };
}
