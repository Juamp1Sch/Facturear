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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
                <label htmlFor="accountingAccountName" className="text-sm font-medium">
                  Cuenta contable (nombre)
                </label>
                <Input
                  id="accountingAccountName"
                  name="accountingAccountName"
                  defaultValue={invoice.accountingAccount?.name ?? ""}
                  placeholder="Ej. Servicios de telecomunicaciones"
                />
                <p className="text-xs text-muted-foreground">
                  Se busca una cuenta existente por nombre; si no existe, se crea una
                  automática como al procesar la factura.
                </p>
              </div>
            </div>

            <EditFormActions onCancel={closeEdit} />
          </form>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campo</TableHead>
                <TableHead>Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Proveedor</TableCell>
                <TableCell>{invoice.providerName ?? "—"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>CUIT</TableCell>
                <TableCell>{invoice.providerCuit ?? "—"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>{dateStr}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Nº comprobante</TableCell>
                <TableCell>{invoice.invoiceNumber ?? "—"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Tipo</TableCell>
                <TableCell>{invoice.invoiceType ?? "—"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Neto</TableCell>
                <TableCell>{formatMoney(invoice.netAmount)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>IVA</TableCell>
                <TableCell>{formatMoney(invoice.vatAmount)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="font-medium">
                  {formatMoney(invoice.totalAmount)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Cuenta contable</TableCell>
                <TableCell>
                  {invoice.accountingAccount
                    ? `${invoice.accountingAccount.code} — ${invoice.accountingAccount.name}`
                    : "—"}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
