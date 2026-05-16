import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { listChartAccountsPageForUser } from "@/actions/chart-accounts";
import { ChartAccountsPagination } from "@/components/chart-accounts-pagination";
import { ChartAccountsTable } from "@/components/chart-accounts-table";
import { CuentasShell } from "@/components/cuentas-shell";
import { DatabaseSetupCard } from "@/components/database-setup-card";
import { isDatabaseConfigured } from "@/lib/database-config";

export const dynamic = "force-dynamic";

export default async function CuentasPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto max-w-5xl flex-1 px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Cuentas</h1>
        <DatabaseSetupCard variant="page" />
      </main>
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const query = await searchParams;
  const parsed = parseInt(query.page ?? "1", 10);
  const requestedPage = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;

  const { accounts, total, page, totalPages, pageSize } =
    await listChartAccountsPageForUser(requestedPage);

  return (
    <main className="mx-auto max-w-5xl flex-1 px-4 py-8">
      <CuentasShell>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Plan de cuentas importado desde tu sistema (Efectivo, bancos, Mercado Pago, etc.). Al
          procesar una factura de proveedor, la IA intenta asignar una cuenta de esta lista según
          el comprobante.
        </p>
        <ChartAccountsTable accounts={accounts} />
        <ChartAccountsPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
        />
      </CuentasShell>
    </main>
  );
}
