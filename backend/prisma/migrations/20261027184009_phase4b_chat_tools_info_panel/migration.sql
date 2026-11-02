-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "markedUnread" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mutedUntil" TIMESTAMP(3),
ADD COLUMN     "pinnedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "aboutText" TEXT,
ADD COLUMN     "aboutUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT DEFAULT 'global',
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_previews" (
    "url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "imagePath" TEXT,
    "siteName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_previews_pkey" PRIMARY KEY ("url")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_sessionId_key_key" ON "app_settings"("sessionId", "key");
