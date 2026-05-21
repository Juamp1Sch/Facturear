-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "batch_id" TEXT;

-- CreateTable
CREATE TABLE "invoice_files" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "part_index" INTEGER NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_batch_id_idx" ON "Invoice"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_files_invoice_id_part_index_key" ON "invoice_files"("invoice_id", "part_index");

-- AddForeignKey
ALTER TABLE "invoice_files" ADD CONSTRAINT "invoice_files_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one InvoiceFile per existing invoice (part 0)
INSERT INTO "invoice_files" ("id", "invoice_id", "part_index", "file_key", "file_url", "mime_type", "created_at")
SELECT
    gen_random_uuid()::text,
    "id",
    0,
    "original_file_key",
    "original_file_url",
    "mime_type",
    "created_at"
FROM "Invoice";
