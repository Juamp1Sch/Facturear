-- AlterTable: Invoice destination upload tracking + perceptions amount
ALTER TABLE "Invoice" ADD COLUMN "destination_uploaded_at" TIMESTAMP(3),
ADD COLUMN "destination_upload_status" INTEGER,
ADD COLUMN "destination_upload_body" TEXT,
ADD COLUMN "perceptions_amount" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "integration_configs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'EXTERNAL',
    "api_url" TEXT NOT NULL,
    "user_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_configs_user_id_key" ON "integration_configs"("user_id");

-- AddForeignKey
ALTER TABLE "integration_configs" ADD CONSTRAINT "integration_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "tax_chart_account_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vat_chart_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_chart_account_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_chart_account_settings_user_id_key" ON "tax_chart_account_settings"("user_id");

-- AddForeignKey
ALTER TABLE "tax_chart_account_settings" ADD CONSTRAINT "tax_chart_account_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_chart_account_settings" ADD CONSTRAINT "tax_chart_account_settings_vat_chart_account_id_fkey" FOREIGN KEY ("vat_chart_account_id") REFERENCES "chart_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "tax_chart_account_perception_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chart_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_chart_account_perception_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_chart_account_perception_links_user_id_chart_account_id_key" ON "tax_chart_account_perception_links"("user_id", "chart_account_id");

-- AddForeignKey
ALTER TABLE "tax_chart_account_perception_links" ADD CONSTRAINT "tax_chart_account_perception_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_chart_account_perception_links" ADD CONSTRAINT "tax_chart_account_perception_links_chart_account_id_fkey" FOREIGN KEY ("chart_account_id") REFERENCES "chart_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
