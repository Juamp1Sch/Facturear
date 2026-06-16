"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { InvoiceDocumentPreview } from "@/components/invoice-document-preview";
import { InvoiceExtractedFields } from "@/components/invoice-extracted-fields";
import { InvoiceUploadButton } from "@/components/invoice-upload-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildInvoiceJson } from "@/lib/invoice-json";
import { parseDiscountFromPayload, parseTaxBreakdownFromPayload } from "@/lib/tax-breakdown";
import type { ResolvedTaxChartAccounts } from "@/lib/tax-chart-account";
import type { SerializedBatchInvoice } from "@/types/invoice";

function isErrorPayload(p: unknown): p is { error: string } {
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
  chartAccount: { code: string; name: string } | null,
  payloadIsError: boolean,
): unknown {
  if (payloadIsError) return aiPayload;
  if (!aiPayload || typeof aiPayload !== "object" || Array.isArray(aiPayload)) {
    return aiPayload;
  }
  const o = { ...(aiPayload as Record<string, unknown>) };
  if (supplierCode) o.supplier_code = supplierCode;
  if (providerCuit) o.cuit = providerCuit;
  if (chartAccount) {
    o.chart_account_code = chartAccount.code;
    o.chart_account_name = chartAccount.name;
  }
  return o;
}

function InvoicePagination({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (index: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <span className="text-sm font-medium">
        Factura {current + 1} de {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={current <= 0}
          onClick={() => onChange(current - 1)}
        >
          <ChevronLeft />
          Anterior
        </Button>
        <select
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          value={current}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Seleccionar factura"
        >
          {Array.from({ length: total }, (_, i) => (
            <option key={i} value={i}>
              Factura {i + 1}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={current >= total - 1}
          onClick={() => onChange(current + 1)}
        >
          Siguiente
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function UploadBatchResultsView({
  invoices,
  taxChartAccounts,
  apiConfigured,
  onInvoiceUpdated,
  presupuestoLetra = null,
}: {
  invoices: SerializedBatchInvoice[];
  taxChartAccounts: ResolvedTaxChartAccounts;
  apiConfigured: boolean;
  onInvoiceUpdated?: (invoice: SerializedBatchInvoice) => void;
  presupuestoLetra?: string | null;
}) {
  const [invoiceIndex, setInvoiceIndex] = useState(0);
  const invoice = invoices[invoiceIndex];
  if (!invoice) return null;

  const payloadIsError = isErrorPayload(invoice.aiPayload);
  const jsonForDisplay = mergeMaestroIntoAiJson(
    invoice.aiPayload,
    invoice.supplierCode,
    invoice.providerCuit,
    invoice.chartAccount,
    payloadIsError,
  );

  const taxBreakdown = parseTaxBreakdownFromPayload(invoice.aiPayload);
  const discountBreakdown = parseDiscountFromPayload(
    invoice.aiPayload,
    invoice.rawOcrText,
  );
  const contableJson = buildInvoiceJson({
    movementId: invoice.movementId,
    empresa: invoice.empresa,
    sucursal: invoice.sucursal,
    supplierCode: invoice.supplierCode,
    invoiceDate: invoice.invoiceDate,
    invoiceType: invoice.invoiceType,
    documentKind: invoice.documentKind,
    invoiceNumber: invoice.invoiceNumber,
    netAmount: invoice.netAmount,
    vatAmount: invoice.vatAmount,
    vatLines: taxBreakdown.vatLines,
    perceptionsAmount: invoice.perceptionsAmount,
    perceptionLines: taxBreakdown.perceptionLines,
    discountAmount:
      discountBreakdown.discountAmount != null
        ? String(discountBreakdown.discountAmount)
        : null,
    discountLines: discountBreakdown.discountLines,
    totalAmount: invoice.totalAmount,
    chartAccount: invoice.chartAccount,
    vatChartAccountCode: taxChartAccounts.vatAccountCode,
    perceptionIvaAccountCode: taxChartAccounts.perceptionIvaAccountCode,
    perceptionIibbAccountCode: taxChartAccounts.perceptionIibbAccountCode,
    bonificacionAccountCode: taxChartAccounts.bonificacionAccountCode,
    ignoreBonificaciones: taxChartAccounts.ignoreBonificaciones,
    tipoMoneda: invoice.tipoMoneda,
  });

  const uploadDisabledReason =
    invoice.status === "PROCESSING"
      ? "La factura aún se está procesando."
      : invoice.status === "ERROR"
        ? "Corregí los datos de la factura antes de cargarla."
        : null;

  const parts = invoice.files.map((f) => ({
    mimeType: f.mimeType,
    previewUrl: f.signedUrl,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">
        Resultados del lote ({invoices.length} factura
        {invoices.length !== 1 ? "s" : ""})
      </h2>

      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant={invoice.status === "ERROR" ? "destructive" : "secondary"}
        >
          {invoice.status}
        </Badge>
        {invoice.aiConfidence != null ? (
          <span className="text-sm text-muted-foreground">
            Confianza IA: {(invoice.aiConfidence * 100).toFixed(0)}%
          </span>
        ) : null}
        <Link
          href={`/history/${invoice.id}`}
          className="text-sm text-primary hover:underline"
        >
          Ver en historial →
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Documento</CardTitle>
            <CardDescription>
              {invoice.files.length > 1
                ? `${invoice.files.length} partes`
                : invoice.mimeType}
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-[320px] p-3 sm:p-6">
            <InvoiceDocumentPreview parts={parts} />
          </CardContent>
        </Card>

        <InvoiceExtractedFields
          invoice={invoice}
          presupuestoLetra={presupuestoLetra}
          onInvoiceUpdated={onInvoiceUpdated}
          perceptionAccountCount={
            (taxChartAccounts.perceptionIvaAccountCode ? 1 : 0) +
            (taxChartAccounts.perceptionIibbAccountCode ? 1 : 0)
          }
          ignoreBonificaciones={taxChartAccounts.ignoreBonificaciones}
        />
      </div>

      <InvoicePagination
        current={invoiceIndex}
        total={invoices.length}
        onChange={setInvoiceIndex}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">JSON contable</CardTitle>
          <CardDescription>
            Formato de exportación para tu sistema de destino.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <InvoiceUploadButton
            invoiceId={invoice.id}
            apiConfigured={apiConfigured}
            destinationUploadedAt={invoice.destinationUploadedAt}
            disabledReason={uploadDisabledReason}
          />
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(contableJson, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Respuesta IA cruda (debug)</CardTitle>
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
