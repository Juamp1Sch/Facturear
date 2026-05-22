import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const invoices = await prisma.invoice.findMany({
    select: {
      id: true,
      originalFileKey: true,
      originalFileUrl: true,
      mimeType: true,
      createdAt: true,
      files: { select: { id: true }, take: 1 },
    },
  });

  let created = 0;
  for (const inv of invoices) {
    if (inv.files.length > 0) continue;
    await prisma.invoiceFile.create({
      data: {
        invoiceId: inv.id,
        partIndex: 0,
        fileKey: inv.originalFileKey,
        fileUrl: inv.originalFileUrl,
        mimeType: inv.mimeType,
        createdAt: inv.createdAt,
      },
    });
    created++;
  }
  console.log(`Backfilled ${created} invoice file(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
