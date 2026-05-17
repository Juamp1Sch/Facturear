"use client";

import { Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useCallback, useState } from "react";

import { updateInvoiceExtractedFields } from "@/actions/invoices";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatInvoiceCalendarDate, invoiceDateToInputValue } from "@/lib/invoice-calendar-date";
import { formatMoney } from "@/lib/format-money";
import type { SerializedInvoiceDetail } from "@/types/invoice";

function amountInputDefault(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isNaN(n) ? "" : String(n);
}

function EditFormActions({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        className="gap-1.5"
        onClick={onCancel}
      >
        <X className="size-3.5" />
        Cancelar
      </Button>
    </div>
  );
}

export function InvoiceExtractedFields({
  invoice,
}: {
  invoice: SerializedInvoiceDetail;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const canEdit = invoice.status !== "PROCESSING";

  const openEdit = useCallback(() => {
    setFormKey((k) => k + 1);
    setError(null);
    setEditing(true);
  }, []);

  const closeEdit = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const dateStr = formatInvoiceCalendarDate(invoice.invoiceDate);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 flex-1 space-y-1.5">
          <CardTitle>Datos extraídos</CardTitle>
          <CardDescription>
            Extracción con IA (visión en imágenes, texto del PDF si aplica). Revisá
            los valores antes de usarlos en contabilidad.
          </CardDescription>
        </div>
        {canEdit && !editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={openEdit}
          >
            <Pencil className="size-3.5" />
            Editar
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {editing ? (
          <form
            key={formKey}
            className="space-y-4"
            action={async (formData) => {
              setError(null);
              const res = await updateInvoiceExtractedFields(formData);
              if (res.ok) {
                setEditing(false);
                router.refresh();
              } else {
                setError(res.error);
              }
            }}
          >
            <input type="hidden" name="invoiceId" value={invoice.id} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="providerName" className="text-sm font-medium">
                  Proveedor
                </label>
                <Input
                  id="providerName"
                  name="providerName"
                  defaultValue={invoice.providerName ?? ""}
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="providerCuit" className="text-sm font-medium">
                  CUIT
                </label>
                <Input
                  id="providerCuit"
                  name="providerCuit"
                  defaultValue={invoice.providerCuit ?? ""}
                  placeholder="XX-XXXXXXXX-X (11 dígitos, cabecera del emisor)"
                  inputMode="numeric"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Son 11 dígitos en total (sin contar guiones). No uses el CUIT del
                  cliente en el cuerpo del comprobante; el del proveedor suele estar
                  arriba en el membrete.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="invoiceDate" className="text-sm font-medium">
                  Fecha
                </label>
                <Input
                  id="invoiceDate"
                  name="invoiceDate"
                  type="date"
                  defaultValue={invoiceDateToInputValue(invoice.invoiceDate)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="invoiceNumber" className="text-sm font-medium">
                  Nº comprobante
                </label>
                <Input
                  id="invoiceNumber"
                  name="invoiceNumber"
                  defaultValue={invoice.invoiceNumber ?? ""}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="invoiceType" className="text-sm font-medium">
                  Tipo
                </label>
                <Input
                  id="invoiceType"
                  name="invoiceType"
                  defaultValue={invoice.invoiceType ?? ""}
                  placeholder="A, B, C…"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="netAmount" className="text-sm font-medium">
                  Neto
                </label>
                <Input
                  id="netAmount"
                  name="netAmount"
                  defaultValue={amountInputDefault(invoice.netAmount)}
                  inputMode="decimal"
                  placeholder="0 o 1234,56"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="vatAmount" className="text-sm font-medium">
                  IVA
                </label>
                <Input
                  id="vatAmount"
                  name="vatAmount"
                  defaultValue={amountInputDefault(invoice.vatAmount)}
                  inputMode="decimal"
                  placeholder="0 o 1234,56"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="totalAmount" className="text-sm font-medium">
                  Total
                </label>
                <Input
                  id="totalAmount"
                  name="totalAmount"
                  defaultValue={amountInputDefault(invoice.totalAmount)}
                  inputMode="decimal"
                  placeholder="0 o 1234,56"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="chartAccountCode" className="text-sm font-medium">
                  Cuenta
                </label>
                <Input
                  id="chartAccountCode"
                  name="chartAccountCode"
                  defaultValue={invoice.chartAccount?.code ?? ""}
                  placeholder="Ej. 1001, 2007"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Código del plan importado en Cuentas (Efectivo, Mercado Pago, Galicia, etc.).
                </p>
              </div>
            </div>

            <EditFormActions onCancel={closeEdit} />
          </form>
        ) : (
          <dl className="divide-y divide-border rounded-lg border border-border">
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">Proveedor</dt>
              <dd className="text-sm break-words">{invoice.providerName ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">CUIT</dt>
              <dd className="text-sm break-words">{invoice.providerCuit ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">Código proveedor</dt>
              <dd className="text-sm break-words">
                {invoice.supplierCode ?? (
                  <span className="text-muted-foreground">
                    Sin proveedor (falta nombre o CUIT en la factura)
                  </span>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">Fecha</dt>
              <dd className="text-sm">{dateStr}</dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">Nº comprobante</dt>
              <dd className="text-sm break-words">{invoice.invoiceNumber ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">Tipo</dt>
              <dd className="text-sm">{invoice.invoiceType ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">Neto</dt>
              <dd className="text-sm">{formatMoney(invoice.netAmount)}</dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">IVA</dt>
              <dd className="text-sm">{formatMoney(invoice.vatAmount)}</dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">Total</dt>
              <dd className="text-sm font-medium">{formatMoney(invoice.totalAmount)}</dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">Cuenta</dt>
              <dd className="text-sm break-words">
                {invoice.chartAccount ? (
                  `${invoice.chartAccount.code} — ${invoice.chartAccount.name}`
                ) : (
                  <span className="text-muted-foreground">
                    Sin asignar (importá el plan en Cuentas)
                  </span>
                )}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
