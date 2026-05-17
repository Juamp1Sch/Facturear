-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "movement_id" TEXT,
ADD COLUMN IF NOT EXISTS "empresa" TEXT,
ADD COLUMN IF NOT EXISTS "sucursal" TEXT,
ADD COLUMN IF NOT EXISTS "document_kind" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_movement_id_key" ON "Invoice"("movement_id");
