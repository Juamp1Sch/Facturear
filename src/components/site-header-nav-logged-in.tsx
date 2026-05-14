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

  return (
    <>
      <Link
        href="/upload"
        aria-current={!onHistory && !onSuppliers ? "page" : undefined}
        className={cn(
          buttonVariants({
            variant: onHistory || onSuppliers ? "ghost" : "default",
            size: "sm",
          }),
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
        )}
      >
        <span className="sm:hidden">Prov.</span>
        <span className="hidden sm:inline">Proveedores</span>
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
