import { AlertTriangle } from "lucide-react";

/** Marca un campo extraído que la verificación automática no pudo confirmar. */
export function ReviewBadge({ reason }: { reason: string }) {
  return (
    <span
      title={reason}
      aria-label={`Revisar: ${reason}`}
      className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    >
      <AlertTriangle className="size-3" aria-hidden />
      Revisar
    </span>
  );
}
