-- CreateTable: intentos fallidos de login/registro por email o IP, en ventana de tiempo.
CREATE TABLE IF NOT EXISTS "auth_rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key")
);
