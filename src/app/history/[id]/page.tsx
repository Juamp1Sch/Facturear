import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { isApiConfiguredForUser } from "@/actions/api-config";
import { getPresupuestoEmpresa, getPresupuestoLetra } from "@/actions/presupuesto-settings";
import { DatabaseSetupCard } from "@/components/database-setup-card";
import { InvoiceDetail } from "@/components/invoice-detail";
import { prisma } from "@/lib/db";
import { isDatabaseConfigured } from "@/lib/database-config";
import { resolveTaxChartAccountsForUser } from "@/lib/tax-chart-account";
import { getSignedReadUrl } from "@/lib/storage";
import { resolveEmpresaSucursalForInvoice } from "@/lib/cuit-associations";
import type { SerializedInvoiceDetail } from "@/types/invoice";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">
          Detalle de factura
        </h1>
        <DatabaseSetupCard variant="page" />
      </main>
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const { id } = await params;
  const query = await searchParams;

  const invoice = await prisma.invoice.findFirst({
    where: { id, userId: session.user.id },
    include: {
      chartAccount: true,
      files: { orderBy: { partIndex: "asc" } },
    },
  });

  if (!invoice) notFound();

  const fileRows =
    invoice.files.length > 0
      ? invoice.files
      : [
          {
            partIndex: 0,
            fileKey: invoice.originalFileKey,
            mimeType: invoice.mimeType,
          },
        ];

  const [
    documentParts,
    taxChartAccounts,
    apiConfigured,
    cuitAssociations,
    presupuestoLetra,
    presupuestoEmpresa,
  ] = await Promise.all([
    Promise.all(
      fileRows.map(async (f) => ({
        mimeType: f.mimeType,
        previewUrl: await getSignedReadUrl(f.fileKey),
      })),
    ),
    resolveTaxChartAccountsForUser(session.user.id),
    isApiConfiguredForUser(session.user.id),
    resolveEmpresaSucursalForInvoice(session.user.id, invoice.providerCuit),
    getPresupuestoLetra(),
    getPresupuestoEmpresa(),
  ]);

  const data = JSON.parse(JSON.stringify(invoice)) as SerializedInvoiceDetail;
  data.cuitEmpresaOptions = cuitAssociations.empresas;
  data.cuitSucursalOptions = cuitAssociations.sucursales;
  data.files = fileRows.map((f, i) => ({
    partIndex: f.partIndex,
    fileKey: f.fileKey,
    fileUrl: "fileUrl" in f && typeof f.fileUrl === "string" ? f.fileUrl : "",
    mimeType: f.mimeType,
    signedUrl: documentParts[i]?.previewUrl ?? "",
  }));

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Detalle de factura
      </h1>
      <InvoiceDetail
        invoice={data}
        taxChartAccounts={taxChartAccounts}
        documentParts={documentParts}
        showErrorBanner={query.error === "1"}
        apiConfigured={apiConfigured}
        presupuestoLetra={presupuestoLetra}
        presupuestoEmpresa={presupuestoEmpresa}
      />
    </main>
  );
}
