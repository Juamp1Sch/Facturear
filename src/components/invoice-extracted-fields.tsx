"use client";

import { Pencil, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  reprocessInvoice,
  setInvoiceEmpresaSucursal,
  setInvoiceTipoMoneda,
  updateInvoiceExtractedFields,
} from "@/actions/invoices";
import { searchSuppliersForPicker } from "@/actions/suppliers";
import { CuitAssociationTabs } from "@/components/cuit-association-tabs";
import { SupplierPicker } from "@/components/supplier-picker";
import {
  CurrencyToggle,
  type CurrencyValue,
} from "@/components/currency-toggle";
import { tipoMonedaToCurrencyValue } from "@/lib/tipo-moneda";
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
import { readAmountsReconcileFlag } from "@/lib/amount-reconcile";
import type { DocumentKind } from "@/lib/comprobante-code";
import { parseDiscountFromPayload, parseTaxBreakdownFromPayload, needsPerceptionBreakdownWarning } from "@/lib/tax-breakdown";
import { groupVatLinesByRate, getVatAmountForCode } from "@/lib/vat-rate";
import {
  DOCUMENT_KIND_OPTIONS,
  documentKindLabel,
  isPresupuestoKind,
} from "@/lib/comprobante-code";
import {
  DOCUMENT_CLASS_OPTIONS,
  documentClassLabel,
  isPresupuestoDocument,
  parseDocumentClass,
  parseFiscalDocumentClass,
} from "@/lib/document-class";
import type { SerializedInvoiceDetail } from "@/types/invoice";
import type { SupplierPickerOption } from "@/types/supplier";
import { cn } from "@/lib/utils";

function effectiveDocumentKind(invoice: SerializedInvoiceDetail): DocumentKind {
  if (isPresupuestoKind(invoice.documentKind)) return "PRESUPUESTO";
  if (parseDocumentClass(invoice.documentClass) === "PRESUPUESTO") {
    return "PRESUPUESTO";
  }
  const kind = invoice.documentKind as DocumentKind | null;
  if (kind && DOCUMENT_KIND_OPTIONS.some((o) => o.value === kind)) {
    return kind;
  }
  return "FACTURA";
}

function documentClassBadgeClass(value: string | null): string {
  const parsed = parseFiscalDocumentClass(value);
  if (parsed === "REMITO_FISCAL") {
    return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300";
  }
  if (parsed === "TICKET_FISCAL") {
    return "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300";
  }
  if (parsed === "FACTURA_FISCAL") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  }
  return "bg-muted text-muted-foreground";
}

function amountInputDefault(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
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
  invoice: invoiceProp,
  onInvoiceUpdated,
  perceptionAccountCount = 0,
}: {
  invoice: SerializedInvoiceDetail;
  onInvoiceUpdated?: (invoice: SerializedInvoiceDetail) => void;
  /** Cantidad de cuentas de percepción configuradas (para aviso de desglose). */
  perceptionAccountCount?: number;
}) {
  const router = useRouter();
  const [displayInvoice, setDisplayInvoice] = useState(invoiceProp);
  const [editing, setEditing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draftEmpresa, setDraftEmpresa] = useState(
    invoiceProp.empresa ?? "",
  );
  const [draftSucursal, setDraftSucursal] = useState(
    invoiceProp.sucursal ?? "",
  );
  const [assocSaving, setAssocSaving] = useState(false);
  const [currencySaving, setCurrencySaving] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [draftProviderName, setDraftProviderName] = useState(
    invoiceProp.providerName ?? "",
  );
  const [draftProviderCuit, setDraftProviderCuit] = useState(
    invoiceProp.providerCuit ?? "",
  );
  const [draftSupplierCode, setDraftSupplierCode] = useState(
    invoiceProp.supplierCode ?? "",
  );
  const [suppliers, setSuppliers] = useState<SupplierPickerOption[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const supplierSearchRequestIdRef = useRef(0);

  useEffect(() => {
    setDisplayInvoice(invoiceProp);
  }, [invoiceProp]);

  useEffect(() => {
    setDraftEmpresa(displayInvoice.empresa ?? "");
    setDraftSucursal(displayInvoice.sucursal ?? "");
  }, [displayInvoice.id, displayInvoice.empresa, displayInvoice.sucursal]);

  const invoice = displayInvoice;
  const kindForDisplay = effectiveDocumentKind(invoice);
  const isPresupuesto = isPresupuestoDocument(invoice.documentKind, invoice.documentClass);
  const [draftDocumentKind, setDraftDocumentKind] = useState<DocumentKind>(kindForDisplay);

  useEffect(() => {
    setDraftDocumentKind(effectiveDocumentKind(displayInvoice));
  }, [displayInvoice.id, displayInvoice.documentKind, displayInvoice.documentClass]);

  const loadSuppliers = useCallback(async (query: string) => {
    const requestId = ++supplierSearchRequestIdRef.current;
    setSuppliersLoading(true);
    try {
      const results = await searchSuppliersForPicker(query);
      if (requestId !== supplierSearchRequestIdRef.current) return;
      setSuppliers(results);
    } catch {
      if (requestId !== supplierSearchRequestIdRef.current) return;
      setError(
        "No se pudieron cargar los proveedores. Cerrá y volvé a abrir la edición.",
      );
      setSuppliers([]);
    } finally {
      if (requestId === supplierSearchRequestIdRef.current) {
        setSuppliersLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!editing) return;
    setDraftProviderName(displayInvoice.providerName ?? "");
    setDraftProviderCuit(displayInvoice.providerCuit ?? "");
    setDraftSupplierCode(displayInvoice.supplierCode ?? "");
    setSuppliers([]);
  }, [
    editing,
    formKey,
    displayInvoice.id,
    displayInvoice.providerName,
    displayInvoice.providerCuit,
    displayInvoice.supplierCode,
  ]);

  const handleProviderNameChange = useCallback((name: string) => {
    setDraftProviderName(name);
    setDraftSupplierCode("");
  }, []);

  const handleProviderPick = useCallback((supplier: SupplierPickerOption) => {
    setDraftProviderName(supplier.name);
    setDraftProviderCuit(supplier.cuit ?? "");
    setDraftSupplierCode(supplier.code);
  }, []);

  const handleProviderCuitChange = useCallback((cuit: string) => {
    setDraftProviderCuit(cuit);
    setDraftSupplierCode("");
  }, []);

  const empresaOpts = invoice.cuitEmpresaOptions ?? [];
  const sucursalOpts = invoice.cuitSucursalOptions ?? [];

  const persistEmpresaSucursalTabs = useCallback(
    async (partial: {
      empresa?: string | null;
      sucursal?: string | null;
    }) => {
      setError(null);
      const fd = new FormData();
      fd.append("invoiceId", invoice.id);
      fd.append(
        "empresa",
        (
          partial.empresa !== undefined
            ? (partial.empresa ?? "")
            : (invoice.empresa ?? "")
        ).trim(),
      );
      fd.append(
        "sucursal",
        (
          partial.sucursal !== undefined
            ? (partial.sucursal ?? "")
            : (invoice.sucursal ?? "")
        ).trim(),
      );
      setAssocSaving(true);
      try {
        const res = await setInvoiceEmpresaSucursal(fd);
        if (res.ok) {
          setDisplayInvoice(res.invoice);
          onInvoiceUpdated?.(res.invoice);
          router.refresh();
        } else {
          setError(res.error);
        }
      } finally {
        setAssocSaving(false);
      }
    },
    [invoice.id, invoice.empresa, invoice.sucursal, onInvoiceUpdated, router],
  );

  const persistTipoMoneda = useCallback(
    async (next: CurrencyValue) => {
      setError(null);
      const fd = new FormData();
      fd.append("invoiceId", invoice.id);
      fd.append("tipoMoneda", next);
      setCurrencySaving(true);
      try {
        const res = await setInvoiceTipoMoneda(fd);
        if (res.ok) {
          setDisplayInvoice(res.invoice);
          onInvoiceUpdated?.(res.invoice);
          router.refresh();
        } else {
          setError(res.error);
        }
      } finally {
        setCurrencySaving(false);
      }
    },
    [invoice.id, onInvoiceUpdated, router],
  );

  const currencyValue = tipoMonedaToCurrencyValue(invoice.tipoMoneda);

  const canEdit = invoice.status !== "PROCESSING";

  const openEdit = useCallback(() => {
    setDraftProviderName(displayInvoice.providerName ?? "");
    setDraftProviderCuit(displayInvoice.providerCuit ?? "");
    setDraftSupplierCode(displayInvoice.supplierCode ?? "");
    setSuppliers([]);
    setFormKey((k) => k + 1);
    setError(null);
    setEditing(true);
  }, [
    displayInvoice.providerName,
    displayInvoice.providerCuit,
    displayInvoice.supplierCode,
  ]);

  const closeEdit = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const handleReprocess = useCallback(async () => {
    const confirmed = window.confirm(
      "¿Reprocesar esta factura? Se volverá a ejecutar la extracción con IA y se sobrescribirán los datos extraídos, incluidas las correcciones manuales. Si ya la enviaste al sistema de destino, tendrás que volver a cargarla.",
    );
    if (!confirmed) return;

    setError(null);
    setReprocessing(true);
    try {
      const res = await reprocessInvoice(invoice.id);
      if (res.ok) {
        setDisplayInvoice(res.invoice);
        onInvoiceUpdated?.(res.invoice);
        setEditing(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    } finally {
      setReprocessing(false);
    }
  }, [invoice.id, onInvoiceUpdated, router]);

  const dateStr = formatInvoiceCalendarDate(invoice.invoiceDate);
  const missingEmpresaSucursal = !invoice.empresa?.trim() || !invoice.sucursal?.trim();
  const amountsReview = readAmountsReconcileFlag(invoice.aiPayload);
  const taxBreakdown = parseTaxBreakdownFromPayload(invoice.aiPayload);
  const discountBreakdown = parseDiscountFromPayload(
    invoice.aiPayload,
    invoice.rawOcrText,
  );
  const vatRateGroups = taxBreakdown.vatLines
    ? groupVatLinesByRate(taxBreakdown.vatLines)
    : [];
  const showDiscriminatedVatEdit =
    vatRateGroups.length > 1 ||
    vatRateGroups.some((group) => group.ivaCode === "I10");
  const showPerceptionBreakdownWarning = needsPerceptionBreakdownWarning(
    invoice.aiPayload,
    invoice.perceptionsAmount,
    perceptionAccountCount,
  );

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
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleReprocess}
              disabled={reprocessing}
            >
              <RefreshCw
                className={cn("size-3.5", reprocessing && "animate-spin")}
              />
              {reprocessing ? "Reprocesando…" : "Reprocesar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={openEdit}
              disabled={reprocessing}
            >
              <Pencil className="size-3.5" />
              Editar
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {amountsReview.needsReview ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            Revisar importes: la suma neto + IVA + percepciones no coincide con el
            total
            {amountsReview.discrepancy != null
              ? ` (dif. ${formatMoney(Math.abs(amountsReview.discrepancy))})`
              : ""}
            . Corregí los valores en Editar.
          </div>
        ) : null}

        {showPerceptionBreakdownWarning ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            Tenés {perceptionAccountCount} cuentas de percepción configuradas, pero esta
            factura no trae desglose por renglón. El JSON contable asignará todo el importe
            a la primera cuenta hasta que la extracción incluya{" "}
            <code className="text-xs">perception_lines</code>.
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
                setDisplayInvoice(res.invoice);
                onInvoiceUpdated?.(res.invoice);
                setEditing(false);
                router.refresh();
              } else {
                setError(res.error);
              }
            }}
          >
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <input type="hidden" name="providerName" value={draftProviderName} />
            <input type="hidden" name="providerCuit" value={draftProviderCuit} />
            <input
              type="hidden"
              name="selectedSupplierCode"
              value={draftSupplierCode}
            />

            {invoice.movementId ? (
              <div className="space-y-2">
                <label htmlFor="movementId" className="text-sm font-medium">
                  ID movimiento
                </label>
                <Input
                  id="movementId"
                  value={invoice.movementId}
                  readOnly
                  className="bg-muted"
                />
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label htmlFor="providerName" className="text-sm font-medium">
                  Proveedor
                </label>
                <SupplierPicker
                  suppliers={suppliers}
                  name={draftProviderName}
                  supplierCode={draftSupplierCode || null}
                  onNameChange={handleProviderNameChange}
                  onSupplierPick={handleProviderPick}
                  onSearch={loadSuppliers}
                  loading={suppliersLoading}
                  inputId="providerName"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="supplierCode" className="text-sm font-medium">
                  Código proveedor
                </label>
                <Input
                  id="supplierCode"
                  value={draftSupplierCode}
                  readOnly
                  className="bg-muted"
                  placeholder="Se completa al elegir del maestro"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="providerCuit" className="text-sm font-medium">
                  CUIT
                </label>
                <Input
                  id="providerCuit"
                  value={draftProviderCuit}
                  onChange={(e) => handleProviderCuitChange(e.target.value)}
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
                  placeholder="00004-00059991"
                />
                <p className="text-xs text-muted-foreground">
                  Punto de venta y número (ej. 00004-00059991).
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="invoiceType" className="text-sm font-medium">
                  Tipo (letra)
                </label>
                <Input
                  id="invoiceType"
                  name="invoiceType"
                  defaultValue={invoice.invoiceType ?? ""}
                  placeholder="A, B, C…"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="documentKind" className="text-sm font-medium">
                  Tipo de documento
                </label>
                <select
                  id="documentKind"
                  name="documentKind"
                  value={draftDocumentKind}
                  onChange={(e) =>
                    setDraftDocumentKind(e.target.value as DocumentKind)
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {DOCUMENT_KIND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <span className="block text-sm font-medium">Moneda</span>
                <CurrencyToggle
                  value={currencyValue}
                  disabled={currencySaving}
                  onSelect={persistTipoMoneda}
                />
              </div>
              {draftDocumentKind !== "PRESUPUESTO" ? (
              <div className="space-y-2">
                <label htmlFor="documentClass" className="text-sm font-medium">
                  Clase (fiscal)
                </label>
                <select
                  id="documentClass"
                  name="documentClass"
                  defaultValue={
                    parseFiscalDocumentClass(invoice.documentClass) ??
                    "FACTURA_FISCAL"
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {DOCUMENT_CLASS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              ) : null}
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
              {showDiscriminatedVatEdit ? (
                <>
                  <input type="hidden" name="vatBreakdownDiscriminated" value="1" />
                  <div className="space-y-2">
                    <label htmlFor="vatAmount21" className="text-sm font-medium">
                      IVA 21%
                    </label>
                    <Input
                      id="vatAmount21"
                      name="vatAmount21"
                      defaultValue={amountInputDefault(
                        getVatAmountForCode(vatRateGroups, "I21"),
                      )}
                      inputMode="decimal"
                      placeholder="0 o 1234,56"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="vatAmount105" className="text-sm font-medium">
                      IVA 10,5%
                    </label>
                    <Input
                      id="vatAmount105"
                      name="vatAmount105"
                      defaultValue={amountInputDefault(
                        getVatAmountForCode(vatRateGroups, "I10"),
                      )}
                      inputMode="decimal"
                      placeholder="0 o 1234,56"
                    />
                  </div>
                </>
              ) : (
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
              )}
              <div className="space-y-2">
                <label htmlFor="perceptionsAmount" className="text-sm font-medium">
                  Percepciones
                </label>
                <Input
                  id="perceptionsAmount"
                  name="perceptionsAmount"
                  defaultValue={amountInputDefault(invoice.perceptionsAmount)}
                  inputMode="decimal"
                  placeholder="0 o 1234,56"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="discountAmount" className="text-sm font-medium">
                  Bonificación
                </label>
                <Input
                  id="discountAmount"
                  name="discountAmount"
                  defaultValue={amountInputDefault(discountBreakdown.discountAmount)}
                  inputMode="decimal"
                  placeholder="0 o 1234,56"
                />
                <p className="text-xs text-muted-foreground">
                  Bonificaciones globales del comprobante. Dejá vacío si no aplica.
                </p>
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

            <div className="space-y-4 border-t border-border pt-4">
              <div>
                <h3 className="text-sm font-medium">Datos que debés completar</h3>
                <p className="text-xs text-muted-foreground">
                  Empresa y sucursal para el JSON contable de exportación.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="empresa" className="text-sm font-medium">
                    Empresa
                  </label>
                  <CuitAssociationTabs
                    ariaLabel="Seleccionar empresa asociada al CUIT del proveedor"
                    options={empresaOpts}
                    value={draftEmpresa}
                    onSelect={(next) => {
                      setDraftEmpresa(next);
                    }}
                  />
                  <Input
                    id="empresa"
                    name="empresa"
                    value={draftEmpresa}
                    onChange={(e) => setDraftEmpresa(e.target.value)}
                    placeholder="Ej. 0001"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="sucursal" className="text-sm font-medium">
                    Sucursal
                  </label>
                  <CuitAssociationTabs
                    ariaLabel="Seleccionar sucursal asociada al CUIT del proveedor"
                    options={sucursalOpts}
                    value={draftSucursal}
                    onSelect={(next) => {
                      setDraftSucursal(next);
                    }}
                  />
                  <Input
                    id="sucursal"
                    name="sucursal"
                    value={draftSucursal}
                    onChange={(e) => setDraftSucursal(e.target.value)}
                    placeholder="Ej. 0001"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>

            <EditFormActions onCancel={closeEdit} />
          </form>
        ) : (
          <>
            {missingEmpresaSucursal ? (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                Falta empresa y/o sucursal para exportar el JSON contable. Completalos
                en Editar.
              </div>
            ) : null}

            <dl className="divide-y divide-border rounded-lg border border-border">
            {invoice.movementId ? (
              <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
                <dt className="text-sm font-medium text-muted-foreground">ID movimiento</dt>
                <dd className="font-mono text-sm break-all">{invoice.movementId}</dd>
              </div>
            ) : null}
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
              <dt className="text-sm font-medium text-muted-foreground">Tipo (letra)</dt>
              <dd className="text-sm">{invoice.invoiceType ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">Tipo documento</dt>
              <dd className="text-sm">
                <span
                  className={
                    isPresupuesto
                      ? "inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      : undefined
                  }
                >
                  {documentKindLabel(kindForDisplay)}
                </span>
              </dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">Moneda</dt>
              <dd className="text-sm">
                <CurrencyToggle
                  value={currencyValue}
                  disabled={currencySaving}
                  onSelect={persistTipoMoneda}
                />
              </dd>
            </div>
            {!isPresupuesto ? (
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">Clase (fiscal)</dt>
              <dd className="text-sm">
                {invoice.documentClass ? (
                <span
                  className={
                    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium " +
                    documentClassBadgeClass(invoice.documentClass)
                  }
                >
                  {documentClassLabel(invoice.documentClass)}
                </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </div>
            ) : null}
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">Neto</dt>
              <dd className="text-sm">{formatMoney(invoice.netAmount)}</dd>
            </div>
            {vatRateGroups.length > 0 ? (
              vatRateGroups.map((group) => (
                <div
                  key={group.gravCode}
                  className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5"
                >
                  <dt className="text-sm font-medium text-muted-foreground">
                    {group.label}
                  </dt>
                  <dd className="text-sm">{formatMoney(group.vatAmount)}</dd>
                </div>
              ))
            ) : (
              <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
                <dt className="text-sm font-medium text-muted-foreground">IVA</dt>
                <dd className="text-sm">{formatMoney(invoice.vatAmount)}</dd>
              </div>
            )}
            <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
              <dt className="text-sm font-medium text-muted-foreground">Percepciones</dt>
              <dd className="text-sm">{formatMoney(invoice.perceptionsAmount)}</dd>
            </div>
            {discountBreakdown.discountAmount != null &&
            discountBreakdown.discountAmount > 0 ? (
              <div className="flex flex-col gap-1 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
                <dt className="text-sm font-medium text-muted-foreground">Bonificación</dt>
                <dd className="text-sm">
                  {formatMoney(discountBreakdown.discountAmount)}
                </dd>
              </div>
            ) : null}
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

            <dl className="mt-4 divide-y divide-border rounded-lg border border-border">
              <div className="bg-muted/30 px-3 py-2">
                <p className="text-sm font-medium">Datos que debés completar</p>
              </div>
              <div className="flex flex-col gap-2 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
                <dt className="text-sm font-medium text-muted-foreground">
                  Empresa
                </dt>
                <dd className="space-y-2 text-sm">
                  <CuitAssociationTabs
                    ariaLabel="Elegí la empresa para esta factura (asociaciones por CUIT)"
                    options={empresaOpts}
                    value={invoice.empresa}
                    disabled={assocSaving}
                    onSelect={(next) =>
                      persistEmpresaSucursalTabs({ empresa: next })
                    }
                  />
                  <div>
                    {invoice.empresa?.trim()
                      ? invoice.empresa
                      : empresaOpts.length > 1
                        ? (
                            <span className="text-muted-foreground">
                              Elegí una opción arriba o abrí Editar.
                            </span>
                          )
                        : "—"}
                  </div>
                </dd>
              </div>
              <div className="flex flex-col gap-2 px-3 py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4 sm:py-2.5">
                <dt className="text-sm font-medium text-muted-foreground">
                  Sucursal
                </dt>
                <dd className="space-y-2 text-sm">
                  <CuitAssociationTabs
                    ariaLabel="Elegí la sucursal para esta factura (asociaciones por CUIT)"
                    options={sucursalOpts}
                    value={invoice.sucursal}
                    disabled={assocSaving}
                    onSelect={(next) =>
                      persistEmpresaSucursalTabs({ sucursal: next })
                    }
                  />
                  <div>
                    {invoice.sucursal?.trim()
                      ? invoice.sucursal
                      : sucursalOpts.length > 1
                        ? (
                            <span className="text-muted-foreground">
                              Elegí una opción arriba o abrí Editar.
                            </span>
                          )
                        : "—"}
                  </div>
                </dd>
              </div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}
