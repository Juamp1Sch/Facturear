"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { uploadInvoiceToDestination } from "@/actions/integration-upload";
import { Button } from "@/components/ui/button";

function formatUploadedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function InvoiceUploadButton({
  invoiceId,
  apiConfigured,
  destinationUploadedAt,
  disabledReason,
}: {
  invoiceId: string;
  apiConfigured: boolean;
  destinationUploadedAt: string | null;
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [responseDetail, setResponseDetail] = useState<string | null>(null);

  const blocked = !apiConfigured || Boolean(disabledReason);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={blocked || pending}
          onClick={async () => {
            setError(null);
            setSuccess(null);
            setResponseDetail(null);
            setPending(true);
            try {
              const res = await uploadInvoiceToDestination(invoiceId);
              if (res.ok) {
                setSuccess(`Factura cargada correctamente (HTTP ${res.status}).`);
                setResponseDetail(res.bodyPreview || null);
                router.refresh();
              } else {
                setError(res.error);
                if (res.bodyPreview) {
                  setResponseDetail(
                    res.status != null
                      ? `HTTP ${res.status}: ${res.bodyPreview}`
                      : res.bodyPreview,
                  );
                }
              }
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? "Cargando…" : "Cargar Factura"}
        </Button>
        {destinationUploadedAt ? (
          <span className="text-sm text-muted-foreground">
            Última carga: {formatUploadedAt(destinationUploadedAt)}
          </span>
        ) : null}
      </div>

      {!apiConfigured ? (
        <p className="text-sm text-muted-foreground">
          Configurá la URL y el token en{" "}
          <Link href="/api-config" className="text-primary underline-offset-4 hover:underline">
            API
          </Link>{" "}
          para habilitar la carga.
        </p>
      ) : null}

      {disabledReason ? (
        <p className="text-sm text-muted-foreground">{disabledReason}</p>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
          {success}
        </div>
      ) : null}

      {responseDetail ? (
        <details className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            Respuesta de la API
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">
            {responseDetail}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
