"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const tabClass =
  "inline-flex items-center justify-center rounded-t-md border border-transparent px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProveedoresShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const onMis = pathname === "/proveedores" || pathname === "/proveedores/";
  const onCarga = pathname.startsWith("/carga-proveedores");

  return (
    <div className="w-full min-w-0 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>

      <div
        role="tablist"
        aria-label="Secciones de proveedores"
        className="flex gap-1 overflow-x-auto border-b border-border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Link
          href="/proveedores"
          role="tab"
          aria-selected={onMis}
          aria-current={onMis ? "page" : undefined}
          className={cn(
            tabClass,
            "shrink-0 whitespace-nowrap",
            onMis
              ? "border-border border-b-transparent bg-background text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          Mis proveedores
        </Link>
        <Link
          href="/carga-proveedores"
          role="tab"
          aria-selected={onCarga}
          aria-current={onCarga ? "page" : undefined}
          className={cn(
            tabClass,
            "shrink-0 whitespace-nowrap",
            onCarga
              ? "border-border border-b-transparent bg-background text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          Cargar proveedores
        </Link>
      </div>

      {children}
    </div>
  );
}
