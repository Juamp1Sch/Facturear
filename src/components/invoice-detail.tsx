import Link from "next/link";

import { InvoiceExtractedFields } from "@/components/invoice-extracted-fields";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SerializedInvoiceDetail } from "@/types/invoice";

function isErrorPayload(
  p: unknown,
): p is { error: string } {
  return (
    typeof p === "object" &&
    p !== null &&
    "error" in p &&
    typeof (p as { error: unknown }).error === "string"
  );
}

function mergeMaestroIntoAiJson(
  aiPayload: unknown,
  supplierCode: string | null,
  providerCuit: string | null,
  payloadIsError: boolean,
): unknown {
  if (payloadIsError) return aiPayload;
  if (!aiPayload || typeof aiPayload !== "object" || Array.isArray(aiPayload)) {
    return aiPayload;
  }
  const o = { ...(aiPayload as Record<string, unknown>) };
  if (supplierCode) {
    o.supplier_code = supplierCode;
  }
  if (providerCuit) {
    o.cuit = providerCuit;
  }
  return o;
}

export function InvoiceDetail({
  invoice,
  previewUrl,
  showErrorBanner,
}: {
  invoice: SerializedInvoiceDetail;
  previewUrl: string;
  showErrorBanner: boolean;
}) {
  const err =
    showErrorBanner && isErrorPayload(invoice.aiPayload)
      ? invoice.aiPayload.error
      : null;

  const payloadIsError = isErrorPayload(invoice.aiPayload);
  const jsonForDisplay = mergeMaestroIntoAiJson(
    invoice.aiPayload,
    invoice.supplierCode,
    invoice.providerCuit,
    payloadIsError,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/history"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Historial
        </Link>
        <Badge variant={invoice.status === "ERROR" ? "destructive" : "secondary"}>
          {invoice.status}
        </Badge>
        {invoice.aiConfidence != null ? (
          <span className="text-sm text-muted-foreground">
            Confianza IA: {(invoice.aiConfidence * 100).toFixed(0)}%
          </span>
        ) : null}
      </div>

      {err ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {err}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Documento</CardTitle>
            <CardDescription>{invoice.mimeType}</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[320px]">
            {invoice.mimeType === "application/pdf" ? (
              <iframe
                title="Factura PDF"
                src={previewUrl}
                className="h-[480px] w-full rounded-md border border-border"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Factura"
                className="max-h-[480px] w-full rounded-md border border-border object-contain"
              />
            )}
          </CardContent>
        </Card>

        <InvoiceExtractedFields invoice={invoice} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Respuesta IA (JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Mostrar / ocultar
            </summary>
            <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(jsonForDisplay, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>

      {invoice.rawOcrText ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Texto OCR</CardTitle>
          </CardHeader>
          <CardContent>
            <details className="group">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Mostrar / ocultar
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                {invoice.rawOcrText}
              </pre>
            </details>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
