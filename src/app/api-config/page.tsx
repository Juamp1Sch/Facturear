import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getApiConfigForUser } from "@/actions/api-config";
import { ApiConfigForm } from "@/components/api-config-form";
import { DatabaseSetupCard } from "@/components/database-setup-card";
import { isDatabaseConfigured } from "@/lib/database-config";

export const dynamic = "force-dynamic";

export default async function ApiConfigPage() {
  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">
          Configuración de API
        </h1>
        <DatabaseSetupCard variant="page" />
      </main>
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const initial = await getApiConfigForUser();

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Configuración de API
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Definí la URL de importación y el token de usuario para enviar el JSON
            contable a tu sistema de destino después de procesar cada factura.
          </p>
        </div>
        <ApiConfigForm initial={initial} />
      </div>
    </main>
  );
}
