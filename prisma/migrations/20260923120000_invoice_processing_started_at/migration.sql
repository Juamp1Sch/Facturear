-- AlterTable: marca de inicio de procesamiento. Si la función serverless se corta por timeout,
-- la factura queda en PROCESSING; pasado un umbral se considera vencida y puede reprocesarse.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "processing_started_at" TIMESTAMP(3);

-- Facturas que ya estaban trabadas: se toma created_at como inicio para que queden liberables.
UPDATE "Invoice" SET "processing_started_at" = "created_at"
WHERE "status" = 'PROCESSING' AND "processing_started_at" IS NULL;
