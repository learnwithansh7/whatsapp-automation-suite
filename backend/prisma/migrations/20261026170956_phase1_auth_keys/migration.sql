/*
  Warnings:

  - You are about to drop the column `encryptedAuth` on the `sessions` table. All the data in the column will be lost.
  - Added the required column `passwordHash` to the `app_users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "app_users" ADD COLUMN     "passwordHash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "encryptedAuth",
ADD COLUMN     "encryptedCreds" TEXT,
ADD COLUMN     "lastDisconnectReason" TEXT,
ALTER COLUMN "status" SET DEFAULT 'idle';

-- CreateTable
CREATE TABLE "auth_keys" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_keys_sessionId_idx" ON "auth_keys"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_keys_sessionId_type_keyId_key" ON "auth_keys"("sessionId", "type", "keyId");

-- AddForeignKey
ALTER TABLE "auth_keys" ADD CONSTRAINT "auth_keys_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
