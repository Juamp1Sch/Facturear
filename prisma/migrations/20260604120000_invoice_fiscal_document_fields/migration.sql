-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "document_class" TEXT,
ADD COLUMN IF NOT EXISTS "afip_code" TEXT,
ADD COLUMN IF NOT EXISTS "fiscal_auth_type" TEXT,
ADD COLUMN IF NOT EXISTS "fiscal_auth_code" TEXT;
