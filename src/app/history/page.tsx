import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DatabaseSetupCard } from "@/components/database-setup-card";
import { HistoryList } from "@/components/history-list";
import { prisma } from "@/lib/db";
import { isDatabaseConfigured } from "@/lib/database-config";
import {
  buildHistoryWhere,
  hasActiveHistoryFilters,
  parseHistoryDateParam,
} from "@/lib/history-search";
import type { SerializedInvoiceListItem } from "@/types/invoice";

export const dynamic = "force-dynamic";

const HISTORY_PAGE_SIZE = 10;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; from?: string; to?: string }>;
}) {
  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
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

  const query = await searchParams;
  const searchQuery = (query.q ?? "").trim();
  const from = parseHistoryDateParam(query.from);
  const to = parseHistoryDateParam(query.to);
  const parsed = parseInt(query.page ?? "1", 10);
  const requestedPage = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;

  const filters = { q: searchQuery, from, to };
  const where = buildHistoryWhere(session.user.id, filters);

  const total = await prisma.invoice.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const rows = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { chartAccount: true },
    skip: (page - 1) * HISTORY_PAGE_SIZE,
    take: HISTORY_PAGE_SIZE,
  });

  const invoices = JSON.parse(JSON.stringify(rows)) as SerializedInvoiceListItem[];

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Historial de facturas
      </h1>
      <HistoryList
        invoices={invoices}
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={HISTORY_PAGE_SIZE}
        searchQuery={searchQuery}
        from={from}
        to={to}
        hasFilters={hasActiveHistoryFilters(filters)}
      />
    </main>
  );
}
