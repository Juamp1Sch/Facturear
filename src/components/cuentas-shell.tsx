"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const tabClass =
  "inline-flex items-center justify-center rounded-t-md border border-transparent px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CuentasShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const onMis = pathname === "/cuentas" || pathname === "/cuentas/";
  const onCarga = pathname.startsWith("/carga-cuentas");
  const onAsociar = pathname.startsWith("/cuentas/asociar-proveedores");
  const onImpuestos = pathname.startsWith("/cuentas/asociar-impuestos");

  return (
    <div className="w-full min-w-0 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Cuentas</h1>

      <div
        role="tablist"
        aria-label="Secciones de cuentas"
        className="flex gap-1 overflow-x-auto border-b border-border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Link
          href="/cuentas"
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
          Plan de cuentas
        </Link>
        <Link
          href="/carga-cuentas"
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
          Importar plan
        </Link>
        <Link
          href="/cuentas/asociar-proveedores"
          role="tab"
          aria-selected={onAsociar}
          aria-current={onAsociar ? "page" : undefined}
          className={cn(
            tabClass,
            "shrink-0 whitespace-nowrap",
            onAsociar
              ? "border-border border-b-transparent bg-background text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          Asociar proveedores
        </Link>
        <Link
          href="/cuentas/asociar-impuestos"
          role="tab"
          aria-selected={onImpuestos}
          aria-current={onImpuestos ? "page" : undefined}
          className={cn(
            tabClass,
            "shrink-0 whitespace-nowrap",
            onImpuestos
              ? "border-border border-b-transparent bg-background text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          Asociar impuestos
        </Link>
      </div>

      {children}
    </div>
  );
}
