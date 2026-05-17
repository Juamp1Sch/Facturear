import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { listSuppliersPageForUser } from "@/actions/suppliers";
import { DatabaseSetupCard } from "@/components/database-setup-card";
import { ProveedoresShell } from "@/components/proveedores-shell";
import { SuppliersPagination } from "@/components/suppliers-pagination";
import { SuppliersSearchBar } from "@/components/suppliers-search-bar";
import { SuppliersTable } from "@/components/suppliers-table";
import { isDatabaseConfigured } from "@/lib/database-config";

export const dynamic = "force-dynamic";

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
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
  const search = (query.q ?? "").trim();
  const parsed = parseInt(query.page ?? "1", 10);
  const requestedPage = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;

  const { suppliers, total, page, totalPages, pageSize, searchQuery } =
    await listSuppliersPageForUser(requestedPage, undefined, search);

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
      <ProveedoresShell>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Listado de proveedores importados o editados manualmente. El código no se puede cambiar;
          el resto de los datos podés ajustarlos con el ícono de lápiz.
        </p>
        <SuppliersSearchBar initialQuery={searchQuery} />
        {searchQuery ? (
          <p className="text-xs text-muted-foreground">
            {total === 0
              ? "Sin resultados"
              : total === 1
                ? "1 proveedor encontrado"
                : `${total} proveedores encontrados`}{" "}
            para «{searchQuery}».
          </p>
        ) : null}
        <SuppliersTable suppliers={suppliers} searchQuery={searchQuery} />
        <SuppliersPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          searchQuery={searchQuery}
        />
      </ProveedoresShell>
    </main>
  );
}
