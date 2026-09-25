-- Sincroniza el historial de migraciones con schema.prisma (drift previo detectado por CI).
-- Idempotente: en producción `supplier_aliases` probablemente ya existe (se creó con db push),
-- y la FK de percepción IIBB puede tener cualquiera de los dos nombres.

-- CreateTable
CREATE TABLE IF NOT EXISTS "supplier_aliases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "alias_key" TEXT NOT NULL,
    "supplier_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "supplier_aliases_user_id_supplier_code_idx" ON "supplier_aliases"("user_id", "supplier_code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_aliases_user_id_alias_key_key" ON "supplier_aliases"("user_id", "alias_key");

DO $$
BEGIN
  -- AddForeignKey
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_aliases_user_id_fkey') THEN
    ALTER TABLE "supplier_aliases" ADD CONSTRAINT "supplier_aliases_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- RenameForeignKey (nombre truncado a mano en 20260613120000 vs el que genera Prisma)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tax_chart_account_settings_perception_iibb_chart_account_id_fke'
  ) THEN
    ALTER TABLE "tax_chart_account_settings"
      RENAME CONSTRAINT "tax_chart_account_settings_perception_iibb_chart_account_id_fke"
      TO "tax_chart_account_settings_perception_iibb_chart_account_i_fkey";
  END IF;
END $$;
