import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function hrefForPage(p: number): string {
  return p <= 1 ? "/proveedores" : `/proveedores?page=${p}`;
}

export function SuppliersPagination({
  page,
  totalPages,
  total,
  pageSize,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}) {
  if (total === 0) {
    return null;
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Paginación de proveedores"
    >
      <p className="text-sm text-muted-foreground">
        Mostrando <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> de{" "}
        <span className="font-medium text-foreground">{total}</span>
        {totalPages > 1 ? (
          <>
            {" "}
            · página <span className="font-medium text-foreground">{page}</span> de{" "}
            <span className="font-medium text-foreground">{totalPages}</span>
          </>
        ) : null}
      </p>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          {page > 1 ? (
            <Link
              href={hrefForPage(page - 1)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "pointer-events-none gap-1 opacity-40",
              )}
            >
              <ChevronLeft className="size-4" />
              Anterior
            </span>
          )}
          {page < totalPages ? (
            <Link
              href={hrefForPage(page + 1)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}
            >
              Siguiente
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "pointer-events-none gap-1 opacity-40",
              )}
            >
              Siguiente
              <ChevronRight className="size-4" />
            </span>
          )}
        </div>
      ) : null}
    </nav>
  );
}
