import Link from "next/link";
import { Download } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ChartAccountsPagination({
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
  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;
  const from = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>
        {total > 0 ? (
          <>
            {from}–{to} de {total} cuentas
          </>
        ) : (
          "0 cuentas"
        )}
      </p>
      <div className="flex gap-2">
        {total > 0 ? (
          <Link
            href="/api/chart-accounts/export"
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
            {prev ? (
              <Link
                href={`/cuentas?page=${prev}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Anterior
              </Link>
            ) : (
              <span
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "pointer-events-none opacity-50",
                )}
              >
                Anterior
              </span>
            )}
            {next ? (
              <Link
                href={`/cuentas?page=${next}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Siguiente
              </Link>
            ) : (
              <span
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "pointer-events-none opacity-50",
                )}
              >
                Siguiente
              </span>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
