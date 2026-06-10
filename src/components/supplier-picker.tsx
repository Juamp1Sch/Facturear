"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

import type { SupplierPickerOption } from "@/actions/suppliers";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function SupplierPicker({
  suppliers,
  name,
  supplierCode,
  onNameChange,
  onSupplierPick,
  disabled,
  loading,
  inputId = "providerName",
}: {
  suppliers: SupplierPickerOption[];
  name: string;
  supplierCode: string | null;
  onNameChange: (name: string) => void;
  onSupplierPick: (supplier: SupplierPickerOption) => void;
  disabled?: boolean;
  loading?: boolean;
  inputId?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLElement | null>(null);

  const [query, setQuery] = useState(name);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [listRect, setListRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const selected = suppliers.find((s) => s.code === supplierCode) ?? null;

  useEffect(() => {
    if (!open) {
      setQuery(name);
    }
  }, [name, open]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return suppliers;
    if (selected && normalizeSearch(selected.name) === q) {
      return suppliers;
    }
    return suppliers.filter((s) => {
      const hay = normalizeSearch(`${s.code} ${s.name} ${s.cuit ?? ""}`);
      return hay.includes(q);
    });
  }, [suppliers, query, selected]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useLayoutEffect(() => {
    if (!open) {
      setListRect(null);
      return;
    }

    const updateRect = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      setListRect({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open, filtered.length, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const pick = (supplier: SupplierPickerOption) => {
    onSupplierPick(supplier);
    setQuery(supplier.name);
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

  const listClassName =
    "max-h-56 overflow-y-auto rounded-md border border-border bg-background py-1 shadow-md";

  const dropdown =
    open && listRect && filtered.length > 0 ? (
      <ul
        ref={(el) => {
          dropdownRef.current = el;
        }}
        id={listId}
        role="listbox"
        className={cn("fixed z-[100]", listClassName)}
        style={{
          top: listRect.top,
          left: listRect.left,
          width: listRect.width,
        }}
      >
        {filtered.map((s, index) => {
          const isSelected = s.code === supplierCode;
          const isActive = index === activeIndex;
          return (
            <li key={s.id} role="option" aria-selected={isSelected}>
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
                onClick={() => pick(s)}
              >
                <div className="break-words">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.code}
                  {s.cuit ? ` — ${s.cuit}` : ""}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    ) : null;

  const emptyDropdown =
    open && listRect && query.trim() && filtered.length === 0 ? (
      <p
        ref={(el) => {
          dropdownRef.current = el;
        }}
        className="fixed z-[100] rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground shadow-md"
        style={{
          top: listRect.top,
          left: listRect.left,
          width: listRect.width,
        }}
      >
        Ningún proveedor coincide.
      </p>
    ) : null;

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled || loading}
          placeholder={
            loading ? "Cargando proveedores…" : "Escribí nombre, código o CUIT…"
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            onNameChange(e.target.value);
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

      {typeof document !== "undefined" && dropdown
        ? createPortal(dropdown, document.body)
        : null}
      {typeof document !== "undefined" && emptyDropdown
        ? createPortal(emptyDropdown, document.body)
        : null}
    </div>
  );
}
