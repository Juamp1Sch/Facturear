import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { isApiConfiguredForUser } from "@/actions/api-config";
import { DatabaseSetupCard } from "@/components/database-setup-card";
import { InvoiceDetail } from "@/components/invoice-detail";
import { prisma } from "@/lib/db";
import { isDatabaseConfigured } from "@/lib/database-config";
import { resolveTaxChartAccountsForUser } from "@/lib/tax-chart-account";
import { getSignedReadUrl } from "@/lib/storage";
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
    include: { chartAccount: true },
  });

  if (!invoice) notFound();

  const [previewUrl, taxChartAccounts, apiConfigured] = await Promise.all([
    getSignedReadUrl(invoice.originalFileKey),
    resolveTaxChartAccountsForUser(session.user.id),
    isApiConfiguredForUser(session.user.id),
  ]);
  const data = JSON.parse(JSON.stringify(invoice)) as SerializedInvoiceDetail;

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Detalle de factura
      </h1>
      <InvoiceDetail
        invoice={data}
        taxChartAccounts={taxChartAccounts}
        previewUrl={previewUrl}
        showErrorBanner={query.error === "1"}
        apiConfigured={apiConfigured}
      />
    </main>
  );
}
