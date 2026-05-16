import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getSupplierChartAssociationFormData } from "@/actions/supplier-chart-accounts";
import { CuentasShell } from "@/components/cuentas-shell";
import { DatabaseSetupCard } from "@/components/database-setup-card";
import { SupplierChartAccountAssociate } from "@/components/supplier-chart-account-associate";
import { isDatabaseConfigured } from "@/lib/database-config";

export const dynamic = "force-dynamic";

export default async function AsociarProveedoresPage() {
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

  const data = await getSupplierChartAssociationFormData();

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
      <CuentasShell>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Vinculá proveedores del maestro con una cuenta del plan (Efectivo, Galicia, Mercado Pago,
          etc.). Cuando subas una factura de un proveedor asociado, la cuenta se asigna
          automáticamente sin depender solo de la IA.
        </p>
        <SupplierChartAccountAssociate data={data} />
      </CuentasShell>
    </main>
  );
}
