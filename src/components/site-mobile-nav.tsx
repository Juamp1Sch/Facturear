"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";

import { logout } from "@/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { guestNavItems, loggedInNavItems } from "@/lib/site-nav";
import { cn } from "@/lib/utils";

function SiteMobileNavDrawer({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const items = loggedIn ? loggedInNavItems : guestNavItems;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "md:hidden",
        )}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
      >
        <Menu className="size-5" />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/45 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background shadow-xl outline-none",
            "transition-transform duration-200 ease-out data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full",
          )}
        >
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <Dialog.Title className="text-base font-semibold text-brand-subsection">
              Menú
            </Dialog.Title>
            <Dialog.Close
              className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
              aria-label="Cerrar menú"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>

          <nav
            className="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
            aria-label="Navegación principal"
          >
            {items.map((item) => {
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
                    "w-full justify-start",
                  )}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {loggedIn ? (
            <div className="border-t border-border p-3">
              <form action={logout}>
                <Button type="submit" variant="outline" className="w-full">
                  Cerrar sesión
                </Button>
              </form>
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SiteMobileNav({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname() ?? "";
  return <SiteMobileNavDrawer key={pathname} loggedIn={loggedIn} />;
}
