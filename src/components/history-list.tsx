"use client";

import { useMemo, useState } from "react";

import { InvoiceCard } from "@/components/invoice-card";
import { Input } from "@/components/ui/input";
import type { SerializedInvoiceListItem } from "@/types/invoice";

export function HistoryList({
  invoices,
}: {
  invoices: SerializedInvoiceListItem[];
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return invoices;
    return invoices.filter((inv) => {
      const hay = [
        inv.providerName,
        inv.providerCuit,
        inv.invoiceNumber,
        inv.accountingAccount?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [invoices, q]);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar por proveedor, CUIT o cuenta…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />
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
    </div>
  );
}
