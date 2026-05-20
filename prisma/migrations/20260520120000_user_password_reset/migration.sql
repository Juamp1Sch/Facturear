-- AlterTable
ALTER TABLE "User" ADD COLUMN "password_reset_token_hash" TEXT,
ADD COLUMN "password_reset_token_expires_at" TIMESTAMP(3);
