"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout } from "@/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { loggedInNavItems } from "@/lib/site-nav";
import { cn } from "@/lib/utils";

export function SiteHeaderNavLoggedIn() {
  const pathname = usePathname() ?? "";

  return (
    <>
      {loggedInNavItems.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              buttonVariants({
                variant: active ? "default" : "ghost",
                size: "sm",
              }),
              "shrink-0",
            )}
          >
            {item.shortLabel ? (
              <>
                <span className="sm:hidden">{item.shortLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </>
            ) : (
              item.label
            )}
          </Link>
        );
      })}
      <form action={logout} className="shrink-0">
        <Button type="submit" variant="outline" size="sm" className="whitespace-nowrap px-2.5 sm:px-3">
          <span className="sm:hidden">Salir</span>
          <span className="hidden sm:inline">Cerrar sesión</span>
        </Button>
      </form>
    </>
  );
}
