import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getTaxChartAssociationFormData } from "@/actions/tax-chart-accounts";
import { CuentasShell } from "@/components/cuentas-shell";
import { DatabaseSetupCard } from "@/components/database-setup-card";
import { TaxChartAccountAssociate } from "@/components/tax-chart-account-associate";
import { isDatabaseConfigured } from "@/lib/database-config";

export const dynamic = "force-dynamic";

export default async function AsociarImpuestosPage() {
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

  const data = await getTaxChartAssociationFormData();

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
      <CuentasShell>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Vinculá la cuenta del plan para IVA y una o más cuentas para percepciones. En el JSON
          contable, el IVA usa su cuenta; las percepciones generan una línea por cuenta (si solo hay
          un total en la factura, se reparte en partes iguales).
        </p>
        <TaxChartAccountAssociate data={data} />
      </CuentasShell>
    </main>
  );
}
