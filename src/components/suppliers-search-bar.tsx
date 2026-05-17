"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { proveedoresListUrl } from "@/lib/supplier-search";

export function SuppliersSearchBar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const lastNavigated = useRef(initialQuery.trim());

  useEffect(() => {
    setValue(initialQuery);
    lastNavigated.current = initialQuery.trim();
  }, [initialQuery]);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === lastNavigated.current) return;

    const timer = window.setTimeout(() => {
      lastNavigated.current = trimmed;
      router.replace(proveedoresListUrl(1, trimmed));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [value, router]);

  return (
    <div className="relative w-full max-w-md">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar por código, nombre, CUIT, dirección…"
        className="pr-9 pl-9"
        aria-label="Buscar proveedores"
      />
      {value.trim() ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
          onClick={() => setValue("")}
          aria-label="Limpiar búsqueda"
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

