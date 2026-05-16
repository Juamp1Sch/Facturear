import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
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
  if (total <= pageSize) return null;

  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>
        {from}–{to} de {total} cuentas
      </p>
      <div className="flex gap-2">
        {prev ? (
          <Link
            href={`/cuentas?page=${prev}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Anterior
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
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
          <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
            Siguiente
          </span>
        )}
      </div>
    </div>
  );
}
