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
      <div className="relative mx-auto flex h-14 w-full items-center justify-end px-4 sm:px-6 lg:px-10">
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
          className="relative z-10 flex max-w-[min(100%,calc(50%-5.75rem))] flex-nowrap items-center justify-end gap-1 overflow-x-auto sm:gap-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
      </div>
    </header>
  );
}
