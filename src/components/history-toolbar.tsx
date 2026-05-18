"use client";

import { Download, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  historyExportUrl,
  historyListUrl,
  type HistoryExportFormat,
} from "@/lib/history-search";
import { cn } from "@/lib/utils";

export function HistoryToolbar({
  initialQuery,
  initialFrom,
  initialTo,
  total,
}: {
  initialQuery: string;
  initialFrom: string;
  initialTo: string;
  total: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [format, setFormat] = useState<HistoryExportFormat>("csv");
  const lastNavigated = useRef({
    q: initialQuery.trim(),
    from: initialFrom,
    to: initialTo,
  });

  useEffect(() => {
    setQuery(initialQuery);
    setFrom(initialFrom);
    setTo(initialTo);
    lastNavigated.current = {
      q: initialQuery.trim(),
      from: initialFrom,
      to: initialTo,
    };
  }, [initialQuery, initialFrom, initialTo]);

  function navigate(filters: { q: string; from: string; to: string }) {
    const q = filters.q.trim();
    const fromVal = filters.from;
    const toVal = filters.to;
    if (
      q === lastNavigated.current.q &&
      fromVal === lastNavigated.current.from &&
      toVal === lastNavigated.current.to
    ) {
      return;
    }
    lastNavigated.current = { q, from: fromVal, to: toVal };
    router.replace(
      historyListUrl({ page: 1, q: q || undefined, from: fromVal, to: toVal }),
    );
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (
      trimmed === lastNavigated.current.q &&
      from === lastNavigated.current.from &&
      to === lastNavigated.current.to
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      navigate({ q: trimmed, from, to });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, from, to]);

  function onFromChange(value: string) {
    setFrom(value);
    navigate({ q: query.trim(), from: value, to });
  }

  function onToChange(value: string) {
    setTo(value);
    navigate({ q: query.trim(), from, to: value });
  }

  function clearDates() {
    setFrom("");
    setTo("");
    navigate({ q: query.trim(), from: "", to: "" });
  }

  const exportHref = historyExportUrl({
    q: initialQuery || undefined,
    from: initialFrom || undefined,
    to: initialTo || undefined,
    format,
  });

  const hasDates = Boolean(from || to);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full max-w-xl">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por proveedor, CUIT o cuenta…"
            className="w-full pr-9 pl-9"
            aria-label="Buscar facturas"
          />
          {query.trim() ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
            >
              <X className="size-4" />
            </Button>
          ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="leading-4">Carga desde</span>
            <Input
              type="date"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
              className="w-[10.5rem]"
              aria-label="Fecha de carga desde"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="leading-4">Carga hasta</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              className="w-[10.5rem]"
              aria-label="Fecha de carga hasta"
            />
          </label>

          {hasDates ? (
            <div className="flex flex-col gap-1">
              <span
                className="hidden text-xs leading-4 sm:block sm:invisible"
                aria-hidden="true"
              >
                Limpiar
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-fit self-start sm:self-auto"
                onClick={clearDates}
              >
                Limpiar fechas
              </Button>
            </div>
          ) : null}
        </div>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className="leading-4">Formato</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as HistoryExportFormat)}
            className={cn(
              "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm",
              "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none",
            )}
            aria-label="Formato de descarga"
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (.xlsx)</option>
          </select>
        </label>

        <div className="flex flex-col gap-1">
          <span
            className="hidden text-xs leading-4 sm:block sm:invisible"
            aria-hidden="true"
          >
            Descargar
          </span>
          {total > 0 ? (
            <Link
              href={exportHref}
              download
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "inline-flex h-8 gap-1.5",
              )}
            >
              <Download className="size-4" />
              Descargar
            </Link>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              disabled
              aria-disabled
            >
              <Download className="size-4" />
              Descargar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
