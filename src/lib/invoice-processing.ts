import { prisma } from "@/lib/db";

/**
 * Más que el máximo de una función en Vercel (800 s en Pro): si una factura sigue en
 * PROCESSING pasado este umbral, la invocación que la procesaba ya murió (timeout).
 */
export const PROCESSING_STALE_MS = 15 * 60 * 1000;

export const STALE_PROCESSING_MESSAGE =
  "El procesamiento se interrumpió antes de terminar (tiempo de ejecución agotado). Reprocesá la factura.";

/**
 * Pasa a ERROR las facturas del usuario trabadas en PROCESSING, para que la UI permita
 * editarlas o reprocesarlas. Devuelve cuántas liberó.
 */
export async function expireStaleProcessingInvoices(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - PROCESSING_STALE_MS);
  const res = await prisma.invoice.updateMany({
    where: {
      userId,
      status: "PROCESSING",
      OR: [
        { processingStartedAt: { lt: cutoff } },
        { processingStartedAt: null, createdAt: { lt: cutoff } },
      ],
    },
    data: {
      status: "ERROR",
      aiPayload: { error: STALE_PROCESSING_MESSAGE },
    },
  });
  return res.count;
}
