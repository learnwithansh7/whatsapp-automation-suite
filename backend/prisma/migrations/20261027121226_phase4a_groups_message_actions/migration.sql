-- AlterTable
ALTER TABLE "group_participants" ADD COLUMN     "displayName" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "deletedForEveryone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "forwardScore" INTEGER,
ADD COLUMN     "hiddenLocally" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isForwarded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isStarred" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mentionedJids" JSONB,
ADD COLUMN     "originalText" TEXT;

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "ownerJid" TEXT,
    "groupCreatedAt" TIMESTAMP(3),
    "announceOnly" BOOLEAN NOT NULL DEFAULT false,
    "restrict" BOOLEAN NOT NULL DEFAULT false,
    "pictureUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "chatJid" TEXT NOT NULL,
    "reactorJid" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "groups_sessionId_idx" ON "groups"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "groups_sessionId_jid_key" ON "groups"("sessionId", "jid");

-- CreateIndex
CREATE INDEX "reactions_sessionId_chatJid_messageId_idx" ON "reactions"("sessionId", "chatJid", "messageId");

-- CreateIndex
CREATE INDEX "reactions_sessionId_idx" ON "reactions"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_sessionId_chatJid_messageId_reactorJid_key" ON "reactions"("sessionId", "chatJid", "messageId", "reactorJid");

-- CreateIndex
CREATE INDEX "messages_sessionId_isStarred_idx" ON "messages"("sessionId", "isStarred");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_sessionId_chatJid_messageId_fkey" FOREIGN KEY ("sessionId", "chatJid", "messageId") REFERENCES "messages"("sessionId", "chatJid", "id") ON DELETE CASCADE ON UPDATE CASCADE;
