"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout } from "@/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SiteHeaderNavLoggedIn() {
  const pathname = usePathname() ?? "";
  const onHistory = pathname.startsWith("/history");

  return (
    <>
      <Link
        href="/upload"
        aria-current={!onHistory ? "page" : undefined}
        className={cn(
          buttonVariants({
            variant: onHistory ? "ghost" : "default",
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
      <form action={logout}>
        <Button type="submit" variant="outline" size="sm">
          Cerrar sesión
        </Button>
      </form>
    </>
  );
}
