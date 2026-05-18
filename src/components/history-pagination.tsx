import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { historyListUrl } from "@/lib/history-search";
import { cn } from "@/lib/utils";

export function HistoryPagination({
  page,
  totalPages,
  total,
  pageSize,
  searchQuery,
  from,
  to,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  searchQuery: string;
  from: string;
  to: string;
}) {
  if (total === 0) {
    return null;
  }

  const fromInv = (page - 1) * pageSize + 1;
  const toInv = Math.min(page * pageSize, total);

  function hrefForPage(p: number): string {
    return historyListUrl({
      page: p,
      q: searchQuery || undefined,
      from: from || undefined,
      to: to || undefined,
    });
  }

  return (
    <nav
      className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Paginación del historial"
    >
      <p className="text-sm text-muted-foreground">
        Mostrando <span className="font-medium text-foreground">{fromInv}</span>–
        <span className="font-medium text-foreground">{toInv}</span> de{" "}
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
