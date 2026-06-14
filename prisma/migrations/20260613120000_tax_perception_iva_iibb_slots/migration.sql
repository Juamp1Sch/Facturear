-- NOTA (Post-Deploy): el modelo pasa de N cuentas de percepción a 2 slots fijos
-- (IVA / IIBB). Los usuarios que tenían más de una cuenta del mismo tipo (p. ej.
-- varias jurisdicciones IIBB) conservan SOLO la primera por código. Avisar que
-- revisen /cuentas/asociar-impuestos tras el deploy.

-- AlterTable: dos slots de percepción (IVA / IIBB) + flag para ignorar bonificaciones
ALTER TABLE "tax_chart_account_settings"
  ADD COLUMN IF NOT EXISTS "perception_iva_chart_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "perception_iibb_chart_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "ignore_bonificaciones" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "tax_chart_account_settings" ADD CONSTRAINT "tax_chart_account_settings_perception_iva_chart_account_id_fkey" FOREIGN KEY ("perception_iva_chart_account_id") REFERENCES "chart_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tax_chart_account_settings" ADD CONSTRAINT "tax_chart_account_settings_perception_iibb_chart_account_id_fkey" FOREIGN KEY ("perception_iibb_chart_account_id") REFERENCES "chart_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: migrar las percepciones existentes (lista N→2 slots) según el nombre de la cuenta.
-- IIBB: cuentas de ingresos brutos. Primera por código ante varias.
UPDATE "tax_chart_account_settings" s
SET "perception_iibb_chart_account_id" = sub."chart_account_id"
FROM (
  SELECT DISTINCT ON (l."user_id") l."user_id", l."chart_account_id"
  FROM "tax_chart_account_perception_links" l
  JOIN "chart_accounts" c ON c."id" = l."chart_account_id"
  WHERE c."name" ILIKE '%iibb%'
     OR c."name" ILIKE '%ingresos brutos%'
     OR c."name" ILIKE '%i.i.b.b%'
  ORDER BY l."user_id", c."code"
) sub
WHERE s."user_id" = sub."user_id";

-- IVA: percepción de IVA (excluye explícitamente IIBB). Primera por código ante varias.
UPDATE "tax_chart_account_settings" s
SET "perception_iva_chart_account_id" = sub."chart_account_id"
FROM (
  SELECT DISTINCT ON (l."user_id") l."user_id", l."chart_account_id"
  FROM "tax_chart_account_perception_links" l
  JOIN "chart_accounts" c ON c."id" = l."chart_account_id"
  WHERE c."name" ILIKE '%iva%'
    AND c."name" NOT ILIKE '%iibb%'
    AND c."name" NOT ILIKE '%ingresos brutos%'
    AND c."name" NOT ILIKE '%i.i.b.b%'
  ORDER BY l."user_id", c."code"
) sub
WHERE s."user_id" = sub."user_id";

-- Fallback: si una cuenta no clasificó como IVA ni IIBB pero existe, asignar la primera
-- (por código) al slot IIBB para no perder la configuración del usuario.
UPDATE "tax_chart_account_settings" s
SET "perception_iibb_chart_account_id" = sub."chart_account_id"
FROM (
  SELECT DISTINCT ON (l."user_id") l."user_id", l."chart_account_id"
  FROM "tax_chart_account_perception_links" l
  JOIN "chart_accounts" c ON c."id" = l."chart_account_id"
  ORDER BY l."user_id", c."code"
) sub
WHERE s."user_id" = sub."user_id"
  AND s."perception_iibb_chart_account_id" IS NULL
  AND s."perception_iva_chart_account_id" IS DISTINCT FROM sub."chart_account_id";

-- DropTable: la lista de percepciones se reemplaza por los dos slots fijos.
DROP TABLE IF EXISTS "tax_chart_account_perception_links";
