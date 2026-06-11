import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  buildSuppliersXlsx,
  supplierToExportRow,
  suppliersExportFilename,
} from "@/lib/supplier-export";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const rows = await prisma.supplier.findMany({
    where: { userId: session.user.id },
    orderBy: { code: "asc" },
    select: {
      code: true,
      name: true,
      cuit: true,
      address: true,
      locality: true,
    },
  });

  const exportRows = rows.map(supplierToExportRow);
  const filename = suppliersExportFilename();

  return new NextResponse(new Uint8Array(buildSuppliersXlsx(exportRows)), {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
