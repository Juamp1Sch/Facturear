"use client";

import { useMemo, useState } from "react";

import { HistoryPagination } from "@/components/history-pagination";
import { InvoiceCard } from "@/components/invoice-card";
import { Input } from "@/components/ui/input";
import type { SerializedInvoiceListItem } from "@/types/invoice";

function matchesSearch(inv: SerializedInvoiceListItem, needle: string) {
  const hay = [
    inv.providerName,
    inv.providerCuit,
    inv.invoiceNumber,
    inv.supplierCode,
    inv.chartAccount?.name,
    inv.chartAccount?.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

export function HistoryList({
  invoices,
  searchPool,
  page,
  totalPages,
  total,
  pageSize,
}: {
  invoices: SerializedInvoiceListItem[];
  searchPool: SerializedInvoiceListItem[];
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}) {
  const [q, setQ] = useState("");
  const searching = q.trim().length > 0;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return invoices;
    return searchPool.filter((inv) => matchesSearch(inv, needle));
  }, [invoices, searchPool, q]);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar por proveedor, CUIT o cuenta…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />

      {searching ? (
        <p className="text-xs text-muted-foreground">
          Buscando en tus {searchPool.length} facturas más recientes (sin paginación).
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay facturas que coincidan.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {filtered.map((inv) => (
            <li key={inv.id}>
              <InvoiceCard invoice={inv} />
            </li>
          ))}
        </ul>
      )}

      {!searching ? (
        <HistoryPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
        />
      ) : null}
    </div>
  );
}
