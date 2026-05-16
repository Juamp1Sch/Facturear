import Link from "next/link";

import { auth } from "@/auth";
import { SiteHeaderNavLoggedIn } from "@/components/site-header-nav-logged-in";
import { SiteMobileNav } from "@/components/site-mobile-nav";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function SiteHeader() {
  const session = await auth();
  const loggedIn = Boolean(session?.user?.id);

  return (
    <header className="border-b border-border bg-muted/40">
      <div className="relative mx-auto flex h-14 w-full items-center justify-between px-4 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-2 md:flex-1">
          <SiteMobileNav loggedIn={loggedIn} />
        </div>

        <Link
          href={loggedIn ? "/upload" : "/"}
          className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-lg font-semibold tracking-tight text-brand-subsection"
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-brand-logo text-sm font-bold text-white shadow-sm"
            aria-hidden
          >
            F
          </span>
          <span className="whitespace-nowrap">Facturear</span>
        </Link>

        <nav
          className="relative z-10 hidden max-w-none flex-nowrap items-center justify-end gap-1 md:flex md:flex-1 md:gap-1.5"
          aria-label="Navegación principal"
        >
          {loggedIn ? (
            <SiteHeaderNavLoggedIn />
          ) : (
            <>
              <Link
                href="/iniciar-sesion"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                Iniciar sesión
              </Link>
              <Link
                href="/registrarse"
                className={cn(buttonVariants({ variant: "default", size: "sm" }))}
              >
                Registrarse
              </Link>
            </>
          )}
        </nav>

        <div className="w-10 shrink-0 md:hidden" aria-hidden />
      </div>
    </header>
  );
}
