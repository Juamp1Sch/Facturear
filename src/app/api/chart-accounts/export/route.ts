import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  buildChartAccountsXlsx,
  chartAccountToExportRow,
  chartAccountsExportFilename,
} from "@/lib/chart-account-export";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const rows = await prisma.chartAccount.findMany({
    where: { userId: session.user.id, active: true },
    orderBy: { code: "asc" },
    select: { code: true, name: true, type: true },
  });

  const exportRows = rows.map(chartAccountToExportRow);
  const filename = chartAccountsExportFilename();

  return new NextResponse(new Uint8Array(buildChartAccountsXlsx(exportRows)), {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
