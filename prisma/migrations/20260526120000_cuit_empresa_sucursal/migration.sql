-- CreateTable
CREATE TABLE "cuit_empresas" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuit_empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuit_sucursales" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuit_sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cuit_empresas_user_id_cuit_idx" ON "cuit_empresas"("user_id", "cuit");

-- CreateIndex
CREATE UNIQUE INDEX "cuit_empresas_user_id_cuit_value_key" ON "cuit_empresas"("user_id", "cuit", "value");

-- CreateIndex
CREATE INDEX "cuit_sucursales_user_id_cuit_idx" ON "cuit_sucursales"("user_id", "cuit");

-- CreateIndex
CREATE UNIQUE INDEX "cuit_sucursales_user_id_cuit_value_key" ON "cuit_sucursales"("user_id", "cuit", "value");

-- AddForeignKey
ALTER TABLE "cuit_empresas" ADD CONSTRAINT "cuit_empresas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuit_sucursales" ADD CONSTRAINT "cuit_sucursales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
