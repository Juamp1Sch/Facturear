import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DatabaseSetupCard } from "@/components/database-setup-card";
import { HistoryList } from "@/components/history-list";
import { prisma } from "@/lib/db";
import { isDatabaseConfigured } from "@/lib/database-config";
import type { SerializedInvoiceListItem } from "@/types/invoice";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto max-w-5xl flex-1 px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">
          Historial de facturas
        </h1>
        <DatabaseSetupCard variant="page" />
      </main>
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const rows = await prisma.invoice.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { accountingAccount: true },
    take: 200,
  });

  const invoices = JSON.parse(
    JSON.stringify(rows),
  ) as SerializedInvoiceListItem[];

  return (
    <main className="mx-auto max-w-5xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Historial de facturas
      </h1>
      <HistoryList invoices={invoices} />
    </main>
  );
}
