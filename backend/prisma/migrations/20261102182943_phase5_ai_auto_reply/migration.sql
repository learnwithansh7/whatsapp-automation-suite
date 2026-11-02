-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ai_configs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minDelaySec" INTEGER NOT NULL DEFAULT 8,
    "maxDelaySec" INTEGER NOT NULL DEFAULT 14,
    "cooldownMin" INTEGER NOT NULL DEFAULT 20,
    "dailyLimit" INTEGER NOT NULL DEFAULT 50,
    "developerBio" TEXT,
    "youtubeUrl" TEXT,
    "youtubeSubs" TEXT,
    "instagramUrl" TEXT,
    "googleMeetMessage" TEXT,
    "fallbackMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_reply_logs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "chatJid" TEXT NOT NULL,
    "incomingText" TEXT NOT NULL,
    "replyText" TEXT NOT NULL,
    "intent" TEXT NOT NULL DEFAULT 'general',
    "delaySeconds" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_reply_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_configs_sessionId_key" ON "ai_configs"("sessionId");

-- CreateIndex
CREATE INDEX "ai_reply_logs_sessionId_chatJid_createdAt_idx" ON "ai_reply_logs"("sessionId", "chatJid", "createdAt");

-- CreateIndex
CREATE INDEX "ai_reply_logs_sessionId_createdAt_idx" ON "ai_reply_logs"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_configs" ADD CONSTRAINT "ai_configs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
