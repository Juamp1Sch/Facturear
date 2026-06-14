-- AlterTable: tipo de cambio USD→ARS leído del comprobante + snapshot de
-- importes originales para revertir la conversión (estilo "Ctrl+Z").
ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(14,4),
  ADD COLUMN IF NOT EXISTS "conversion_backup" JSONB;
