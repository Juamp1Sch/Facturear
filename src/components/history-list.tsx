import { HistoryPagination } from "@/components/history-pagination";
import { HistoryToolbar } from "@/components/history-toolbar";
import { InvoiceCard } from "@/components/invoice-card";
import { formatHistoryDateParamDisplay } from "@/lib/history-search";
import type { SerializedInvoiceListItem } from "@/types/invoice";

export function HistoryList({
  invoices,
  page,
  totalPages,
  total,
  pageSize,
  searchQuery,
  from,
  to,
  hasFilters,
}: {
  invoices: SerializedInvoiceListItem[];
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  searchQuery: string;
  from: string;
  to: string;
  hasFilters: boolean;
}) {
  const fromDisplay = from ? formatHistoryDateParamDisplay(from) : "";
  const toDisplay = to ? formatHistoryDateParamDisplay(to) : "";

  return (
    <div className="space-y-4">
      <HistoryToolbar
        initialQuery={searchQuery}
        initialFrom={from}
        initialTo={to}
        total={total}
      />

      {hasFilters ? (
        <p className="text-xs text-muted-foreground">
          {total === 0
            ? "Sin resultados"
            : total === 1
              ? "1 factura encontrada"
              : `${total} facturas encontradas`}
          {searchQuery ? ` para «${searchQuery}»` : null}
          {from || to
            ? ` · carga${
                from && to
                  ? ` del ${fromDisplay} al ${toDisplay}`
                  : from
                    ? ` desde ${fromDisplay}`
                    : ` hasta ${toDisplay}`
              }`
            : null}
          .
        </p>
      ) : null}

      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay facturas que coincidan.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {invoices.map((inv) => (
            <li key={inv.id}>
              <InvoiceCard invoice={inv} />
            </li>
          ))}
        </ul>
      )}

      <HistoryPagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        searchQuery={searchQuery}
        from={from}
        to={to}
      />
    </div>
  );
}
