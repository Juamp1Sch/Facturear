import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { countChartAccountsForUser } from "@/actions/chart-accounts";
import { ChartAccountsImportForm } from "@/components/chart-accounts-import-form";
import { CuentasShell } from "@/components/cuentas-shell";
import { DatabaseSetupCard } from "@/components/database-setup-card";
import { isDatabaseConfigured } from "@/lib/database-config";

export const dynamic = "force-dynamic";

export default async function CargaCuentasPage() {
  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Cuentas</h1>
        <DatabaseSetupCard variant="page" />
      </main>
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const accountCount = await countChartAccountsForUser();

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
      <CuentasShell>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Importá el plan de cuentas exportado de tu sistema (columnas Cuenta, Nombre y opcionalmente
          Tipo). El archivo «Plan de cuentas.xlsx» con EFECTIVO, MERCADO PAGO, GALICIA, etc. es
          compatible.
        </p>
        <ChartAccountsImportForm initialCount={accountCount} />
      </CuentasShell>
    </main>
  );
}
