import Link from "next/link";

import { auth } from "@/auth";
import { SiteHeaderNavLoggedIn } from "@/components/site-header-nav-logged-in";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function SiteHeader() {
  const session = await auth();
  const loggedIn = Boolean(session?.user?.id);

  return (
    <header className="border-b border-border bg-muted/40">
      <div className="mx-auto grid max-w-5xl grid-cols-3 items-center gap-2 px-4 py-3 sm:gap-4">
        <div className="min-w-0" aria-hidden="true" />

        <Link
          href={loggedIn ? "/upload" : "/"}
          className="flex items-center justify-center gap-2 justify-self-center text-lg font-semibold tracking-tight text-brand-subsection"
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-brand-logo text-sm font-bold text-white shadow-sm"
            aria-hidden
          >
            F
          </span>
          <span className="truncate">Facturear</span>
        </Link>

        <nav className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
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
      </div>
    </header>
  );
}
