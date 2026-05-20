-- AlterTable
ALTER TABLE "User" ADD COLUMN "email_verified_at" TIMESTAMP(3),
ADD COLUMN "verification_token_hash" TEXT,
ADD COLUMN "verification_token_expires_at" TIMESTAMP(3);

-- Grandfather: existing users remain able to log in without manual activation
UPDATE "User"
SET "email_verified_at" = "created_at"
WHERE "email_verified_at" IS NULL;
