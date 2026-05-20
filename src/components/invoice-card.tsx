import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCreatedAtDateArgentina } from "@/lib/history-search";
import { formatInvoiceCalendarDate } from "@/lib/invoice-calendar-date";
import { formatMoney } from "@/lib/format-money";
import type { SerializedInvoiceListItem } from "@/types/invoice";

const statusLabel: Record<string, string> = {
  PROCESSING: "Procesando",
  READY: "Listo",
  ERROR: "Error",
  CORRECTED: "Corregido",
};

function statusVariant(
  s: SerializedInvoiceListItem["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (s === "READY") return "default";
  if (s === "ERROR") return "destructive";
  return "secondary";
}

export function InvoiceCard({ invoice }: { invoice: SerializedInvoiceListItem }) {
  const title = invoice.providerName?.trim() || "Proveedor desconocido";
  const emissionStr = formatInvoiceCalendarDate(invoice.invoiceDate);
  const uploadedStr = formatCreatedAtDateArgentina(invoice.createdAt);

  return (
    <Link href={`/history/${invoice.id}`}>
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2 text-base">{title}</CardTitle>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge variant={statusVariant(invoice.status)}>
                {statusLabel[invoice.status] ?? invoice.status}
              </Badge>
              {invoice.destinationUploadedAt ? (
                <Badge variant="outline">Cargada</Badge>
              ) : null}
            </div>
          </div>
          <CardDescription className="line-clamp-2">
            {invoice.providerCuit ?? "CUIT —"} ·{" "}
            {invoice.supplierCode ? `Cód. ${invoice.supplierCode} · ` : null}
            Emisión: {emissionStr}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="text-muted-foreground">
            Fecha de carga:{" "}
            <span className="text-foreground">{uploadedStr}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Total:</span>{" "}
            <span className="font-medium">
              {formatMoney(invoice.totalAmount)}
            </span>
          </p>
          {invoice.chartAccount ? (
            <p className="text-muted-foreground line-clamp-1">
              Cuenta: {invoice.chartAccount.code} — {invoice.chartAccount.name}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}
