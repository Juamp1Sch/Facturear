import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { countSuppliersForUser } from "@/actions/suppliers";
import { DatabaseSetupCard } from "@/components/database-setup-card";
import { ProveedoresShell } from "@/components/proveedores-shell";
import { SuppliersImportForm } from "@/components/suppliers-import-form";
import { isDatabaseConfigured } from "@/lib/database-config";

export const dynamic = "force-dynamic";

export default async function CargaProveedoresPage() {
  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto max-w-5xl flex-1 px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Proveedores</h1>
        <DatabaseSetupCard variant="page" />
      </main>
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const supplierCount = await countSuppliersForUser();

  return (
    <main className="mx-auto max-w-5xl flex-1 px-4 py-8">
      <ProveedoresShell>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Importá el maestro de proveedores de tu sistema contable. El CUIT en el archivo es
          opcional: si está cargado, se usa para cruzar con las facturas y para dar a la IA una
          referencia cuando el emisor coincide con el maestro. Sin CUIT, el proveedor se guarda
          igual y la lectura del comprobante sigue como hasta ahora.
        </p>
        <SuppliersImportForm initialCount={supplierCount} />
      </ProveedoresShell>
    </main>
  );
}
