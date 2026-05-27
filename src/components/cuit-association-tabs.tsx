"use client";

import { cn } from "@/lib/utils";

const tabBase =
  "inline-flex shrink-0 items-center justify-center rounded-t-md border border-transparent px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type CuitAssociationTabsProps = {
  ariaLabel: string;
  options: string[];
  value: string | null | undefined;
  disabled?: boolean;
  /** Solo se muestra cuando hay más de una opción. */
  minOptions?: number;
  onSelect: (next: string) => void | Promise<void>;
};

export function CuitAssociationTabs({
  ariaLabel,
  options,
  value,
  disabled = false,
  minOptions = 2,
  onSelect,
}: CuitAssociationTabsProps) {
  if (options.length < minOptions) return null;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="-mx-1 flex flex-wrap gap-1 px-1"
    >
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            className={cn(
              tabBase,
              selected
                ? "border-border border-b-transparent bg-background text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            onClick={() => {
              void onSelect(opt);
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
