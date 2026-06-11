import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

import { proveedoresListUrl } from "@/lib/supplier-search";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SuppliersPagination({
  page,
  totalPages,
  total,
  pageSize,
  searchQuery = "",
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  searchQuery?: string;
}) {
  const from = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Paginación de proveedores"
    >
      <p className="text-sm text-muted-foreground">
        {total > 0 ? (
          <>
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
          </>
        ) : (
          "Sin proveedores"
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {total > 0 ? (
          <Link
            href="/api/suppliers/export"
            download
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1",
            )}
          >
            <Download className="size-4" />
            Descargar
          </Link>
        ) : (
          <Button variant="outline" size="sm" className="gap-1" disabled aria-disabled>
            <Download className="size-4" />
            Descargar
          </Button>
        )}
        {totalPages > 1 ? (
          <>
            {page > 1 ? (
              <Link
                href={proveedoresListUrl(page - 1, searchQuery)}
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
                href={proveedoresListUrl(page + 1, searchQuery)}
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
          </>
        ) : null}
      </div>
    </nav>
  );
}
