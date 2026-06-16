-- AlterTable: letra por defecto a asignar cuando un procesamiento detecta un
-- documento Presupuesto (no fiscal). Configurable por usuario.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "presupuesto_letra" TEXT;
