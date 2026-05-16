"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout } from "@/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SiteHeaderNavLoggedIn() {
  const pathname = usePathname() ?? "";
  const onHistory = pathname.startsWith("/history");
  const onSuppliers =
    pathname.startsWith("/proveedores") || pathname.startsWith("/carga-proveedores");
  const onAccounts =
    pathname.startsWith("/cuentas") || pathname.startsWith("/carga-cuentas");
  const onPrimary = !onHistory && !onSuppliers && !onAccounts;

  return (
    <>
      <Link
        href="/upload"
        aria-current={onPrimary ? "page" : undefined}
        className={cn(
          buttonVariants({
            variant: onPrimary ? "default" : "ghost",
            size: "sm",
          }),
          "shrink-0",
        )}
      >
        <span className="sm:hidden">Subir</span>
        <span className="hidden sm:inline">Subir factura</span>
      </Link>
      <Link
        href="/history"
        aria-current={onHistory ? "page" : undefined}
        className={cn(
          buttonVariants({
            variant: onHistory ? "default" : "ghost",
            size: "sm",
          }),
          "shrink-0",
        )}
      >
        Historial
      </Link>
      <Link
        href="/proveedores"
        aria-current={onSuppliers ? "page" : undefined}
        className={cn(
          buttonVariants({
            variant: onSuppliers ? "default" : "ghost",
            size: "sm",
          }),
          "shrink-0",
        )}
      >
        <span className="sm:hidden">Prov.</span>
        <span className="hidden sm:inline">Proveedores</span>
      </Link>
      <Link
        href="/cuentas"
        aria-current={onAccounts ? "page" : undefined}
        className={cn(
          buttonVariants({
            variant: onAccounts ? "default" : "ghost",
            size: "sm",
          }),
          "shrink-0",
        )}
      >
        Cuentas
      </Link>
      <form action={logout} className="shrink-0">
        <Button type="submit" variant="outline" size="sm" className="whitespace-nowrap px-2.5 sm:px-3">
          <span className="sm:hidden">Salir</span>
          <span className="hidden sm:inline">Cerrar sesión</span>
        </Button>
      </form>
    </>
  );
}
