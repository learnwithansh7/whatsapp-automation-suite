-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "lid" TEXT,
    "name" TEXT,
    "pushName" TEXT,
    "phoneNumber" TEXT,
    "profilePictureUrl" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chats" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'private',
    "name" TEXT,
    "lastMessageId" TEXT,
    "lastMessageText" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessageFromMe" BOOLEAN,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "chatJid" TEXT NOT NULL,
    "senderJid" TEXT,
    "fromMe" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "caption" TEXT,
    "mediaMime" TEXT,
    "mediaFileName" TEXT,
    "mediaSize" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'delivered',
    "replyToMessageId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "raw" JSONB,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("sessionId","chatJid","id")
);

-- CreateTable
CREATE TABLE "group_participants" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "groupJid" TEXT NOT NULL,
    "participantJid" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'participant',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_sessionId_lid_idx" ON "contacts"("sessionId", "lid");

-- CreateIndex
CREATE INDEX "contacts_sessionId_idx" ON "contacts"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_sessionId_jid_key" ON "contacts"("sessionId", "jid");

-- CreateIndex
CREATE INDEX "chats_sessionId_lastMessageAt_idx" ON "chats"("sessionId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "chats_sessionId_idx" ON "chats"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "chats_sessionId_jid_key" ON "chats"("sessionId", "jid");

-- CreateIndex
CREATE INDEX "messages_sessionId_chatJid_timestamp_idx" ON "messages"("sessionId", "chatJid", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "messages_sessionId_timestamp_idx" ON "messages"("sessionId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "messages_sessionId_chatJid_id_key" ON "messages"("sessionId", "chatJid", "id");

-- CreateIndex
CREATE INDEX "group_participants_sessionId_groupJid_idx" ON "group_participants"("sessionId", "groupJid");

-- CreateIndex
CREATE UNIQUE INDEX "group_participants_sessionId_groupJid_participantJid_key" ON "group_participants"("sessionId", "groupJid", "participantJid");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sessionId_chatJid_fkey" FOREIGN KEY ("sessionId", "chatJid") REFERENCES "chats"("sessionId", "jid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_participants" ADD CONSTRAINT "group_participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
