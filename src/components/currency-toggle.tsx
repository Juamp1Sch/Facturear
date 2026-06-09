"use client";

import { cn } from "@/lib/utils";
import type { CurrencyValue } from "@/lib/tipo-moneda";

export type { CurrencyValue };

const optionBase =
  "inline-flex h-6 shrink-0 items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

type CurrencyToggleProps = {
  value: CurrencyValue;
  disabled?: boolean;
  onSelect: (next: CurrencyValue) => void | Promise<void>;
};

const OPTIONS: { value: CurrencyValue; label: string }[] = [
  { value: "ars", label: "ARS" },
  { value: "usd", label: "USD" },
];

export function CurrencyToggle({
  value,
  disabled = false,
  onSelect,
}: CurrencyToggleProps) {
  return (
    <div
      role="group"
      aria-label="Moneda del comprobante"
      className="inline-flex flex-wrap items-center gap-0.5"
    >
      {OPTIONS.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            className={cn(
              optionBase,
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            onClick={() => {
              if (!selected) {
                void onSelect(opt.value);
              }
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
