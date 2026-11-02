-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "mediaDownloadStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "mediaPath" TEXT,
ADD COLUMN     "thumbnail" TEXT,
ADD COLUMN     "width" INTEGER;

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "chatJid" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "messageId" TEXT,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_sessionId_status_scheduledFor_idx" ON "outbox"("sessionId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "outbox_sessionId_idx" ON "outbox"("sessionId");

-- AddForeignKey
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
