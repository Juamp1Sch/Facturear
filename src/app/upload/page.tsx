import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getPresupuestoEmpresa, getPresupuestoLetra } from "@/actions/presupuesto-settings";
import { DatabaseSetupCard } from "@/components/database-setup-card";
import { UploadForm } from "@/components/upload-form";
import { isDatabaseConfigured } from "@/lib/database-config";

export default async function UploadPage() {
  const dbOk = isDatabaseConfigured();
  let presupuestoLetra: string | null = null;
  let presupuestoEmpresa: string | null = null;

  if (dbOk) {
    const session = await auth();
    if (!session?.user?.id) {
      redirect("/iniciar-sesion");
    }
    [presupuestoLetra, presupuestoEmpresa] = await Promise.all([
      getPresupuestoLetra(),
      getPresupuestoEmpresa(),
    ]);
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
      <h1 className="mx-auto mb-6 w-full max-w-xl text-2xl font-semibold tracking-tight">
        Cargar facturas
      </h1>
      {!dbOk ? (
        <div className="mb-6">
          <DatabaseSetupCard variant="inline" />
        </div>
      ) : null}
      <UploadForm
        presupuestoLetra={presupuestoLetra}
        presupuestoEmpresa={presupuestoEmpresa}
      />
    </main>
  );
}
