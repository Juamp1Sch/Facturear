-- AlterTable
ALTER TABLE "tax_chart_account_settings" ADD COLUMN IF NOT EXISTS "bonificacion_chart_account_id" TEXT;

-- AddForeignKey
ALTER TABLE "tax_chart_account_settings" ADD CONSTRAINT "tax_chart_account_settings_bonificacion_chart_account_id_fkey" FOREIGN KEY ("bonificacion_chart_account_id") REFERENCES "chart_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
