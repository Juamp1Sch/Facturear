import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  buildHistoryCsv,
  buildHistoryXlsx,
  exportFilename,
  HISTORY_EXPORT_MAX_ROWS,
  invoiceToExportRow,
} from "@/lib/history-export";
import {
  buildHistoryWhere,
  parseHistoryDateParam,
  type HistoryExportFormat,
} from "@/lib/history-search";
import type { SerializedInvoiceListItem } from "@/types/invoice";

export const dynamic = "force-dynamic";

function parseFormat(value: string | null): HistoryExportFormat | null {
  if (value === "csv" || value === "xlsx") return value;
  return null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const format = parseFormat(searchParams.get("format"));
  if (!format) {
    return new NextResponse("Invalid format. Use csv or xlsx.", { status: 400 });
  }

  const filters = {
    q: (searchParams.get("q") ?? "").trim(),
    from: parseHistoryDateParam(searchParams.get("from")),
    to: parseHistoryDateParam(searchParams.get("to")),
  };

  const where = buildHistoryWhere(session.user.id, filters);

  const rows = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { chartAccount: true },
    take: HISTORY_EXPORT_MAX_ROWS,
  });

  const invoices = JSON.parse(JSON.stringify(rows)) as SerializedInvoiceListItem[];
  const exportRows = invoices.map(invoiceToExportRow);
  const filename = exportFilename(format);

  const headers: Record<string, string> = {
    "Content-Disposition": `attachment; filename="${filename}"`,
  };

  if (format === "csv") {
    headers["Content-Type"] = "text/csv; charset=utf-8";
    return new NextResponse(new Uint8Array(buildHistoryCsv(exportRows)), {
      headers,
    });
  }

  headers["Content-Type"] =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new NextResponse(new Uint8Array(buildHistoryXlsx(exportRows)), {
    headers,
  });
}
