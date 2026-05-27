import Image from "next/image";
import Link from "next/link";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { SiteHeaderNavLoggedIn } from "@/components/site-header-nav-logged-in";
import { SiteMobileNav } from "@/components/site-mobile-nav";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function welcomeDisplayName(session: Session | null): string | null {
  const name = session?.user?.name?.trim();
  if (name) return name;
  const email = session?.user?.email?.trim();
  if (email) return email.split("@")[0] ?? email;
  return null;
}

export async function SiteHeader() {
  const session = await auth();
  const loggedIn = Boolean(session?.user?.id);
  const userName = loggedIn ? welcomeDisplayName(session) : null;

  return (
    <header className="w-full border-b border-border bg-muted/40">
      <div className="relative mx-auto flex h-16 w-full items-center justify-between px-4 sm:h-[4.75rem] sm:px-6 lg:px-10">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:max-w-[min(100%,18rem)] lg:max-w-xs">
          <SiteMobileNav loggedIn={loggedIn} />
          {userName ? (
            <p
              className="hidden min-w-0 truncate text-sm font-medium text-foreground sm:block"
              title={`Usuario: ${userName}`}
            >
              Usuario: {userName}
            </p>
          ) : null}
        </div>

        <Link
          href={loggedIn ? "/upload" : "/"}
          className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
          aria-label="AgileScan"
        >
          <Image
            src="/brand/logo-header.png"
            alt=""
            width={1600}
            height={780}
            unoptimized
            className="h-14 w-auto max-w-[min(100vw-4rem,28rem)] shrink-0 object-contain sm:h-16 sm:max-w-[32rem]"
            priority
          />
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
