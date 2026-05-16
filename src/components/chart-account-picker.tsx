"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ChartAccountOption = {
  id: string;
  code: string;
  name: string;
  type: string | null;
};

function formatAccountLabel(a: ChartAccountOption): string {
  const typeSuffix = a.type ? ` (${a.type})` : "";
  return `${a.code} — ${a.name}${typeSuffix}`;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function ChartAccountPicker({
  accounts,
  value,
  onChange,
  disabled,
}: {
  accounts: ChartAccountOption[];
  value: string;
  onChange: (accountId: string) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = accounts.find((a) => a.id === value);

  useEffect(() => {
    if (!open && selected) {
      setQuery(formatAccountLabel(selected));
    }
    if (!open && !selected) {
      setQuery("");
    }
  }, [open, selected]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return accounts;
    if (selected && normalizeSearch(formatAccountLabel(selected)) === q) {
      return accounts;
    }
    return accounts.filter((a) => {
      const hay = normalizeSearch(`${a.code} ${a.name} ${a.type ?? ""}`);
      return hay.includes(q);
    });
  }, [accounts, query, selected]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const pick = (account: ChartAccountOption) => {
    onChange(account.id);
    setQuery(formatAccountLabel(account));
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[activeIndex]) {
      e.preventDefault();
      pick(filtered[activeIndex]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          id="chartAccountId"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder="Escribí código o nombre de cuenta…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange("");
          }}
          onFocus={() => {
            setOpen(true);
            if (selected) {
              setQuery("");
            }
          }}
          onKeyDown={onKeyDown}
          className="pr-9"
        />
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>

      {open && filtered.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-background py-1 shadow-md"
        >
          {filtered.map((a, index) => {
            const label = formatAccountLabel(a);
            const isSelected = a.id === value;
            const isActive = index === activeIndex;
            return (
              <li key={a.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm",
                    isActive && "bg-muted",
                    isSelected && "font-medium",
                    !isActive && !isSelected && "hover:bg-muted/60",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(a)}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {open && query.trim() && filtered.length === 0 ? (
        <p className="absolute z-50 mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground shadow-md">
          Ninguna cuenta coincide.
        </p>
      ) : null}
    </div>
  );
}
