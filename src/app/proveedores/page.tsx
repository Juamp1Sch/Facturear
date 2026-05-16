import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { listSuppliersPageForUser } from "@/actions/suppliers";
import { DatabaseSetupCard } from "@/components/database-setup-card";
import { ProveedoresShell } from "@/components/proveedores-shell";
import { SuppliersPagination } from "@/components/suppliers-pagination";
import { SuppliersTable } from "@/components/suppliers-table";
import { isDatabaseConfigured } from "@/lib/database-config";

export const dynamic = "force-dynamic";

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Proveedores</h1>
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

  const { suppliers, total, page, totalPages, pageSize } =
    await listSuppliersPageForUser(requestedPage);

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
      <ProveedoresShell>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Listado de proveedores importados o editados manualmente. El código no se puede cambiar;
          el resto de los datos podés ajustarlos con el ícono de lápiz.
        </p>
        <SuppliersTable suppliers={suppliers} />
        <SuppliersPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
        />
      </ProveedoresShell>
    </main>
  );
}
