import { prisma } from '../lib/prisma.js';

export class MergeService {
  /**
   * Merge a LID chat into a canonical Phone JID chat.
   * Re-links all messages to the phone chat, merges unread counts and last message stats,
   * and deletes the duplicate LID chat.
   */
  public async mergeLidAndPhoneChats(
    sessionId: string,
    phoneJid: string,
    lidJid: string,
  ): Promise<boolean> {
    if (phoneJid === lidJid) return false;

    const [phoneChat, lidChat] = await Promise.all([
      prisma.chat.findUnique({
        where: { sessionId_jid: { sessionId, jid: phoneJid } },
      }),
      prisma.chat.findUnique({
        where: { sessionId_jid: { sessionId, jid: lidJid } },
      }),
    ]);

    // If no LID chat exists, nothing to merge
    if (!lidChat) return false;

    try {
      // 1. Re-link messages from LID chat to Phone JID chat
      const lidMessages = await prisma.message.findMany({
        where: { sessionId, chatJid: lidJid },
      });

      for (const msg of lidMessages) {
        const existing = await prisma.message.findUnique({
          where: {
            sessionId_chatJid_id: {
              sessionId,
              chatJid: phoneJid,
              id: msg.id,
            },
          },
        });

        if (existing) {
          // If message already exists on canonical chat, delete duplicate LID message
          await prisma.message.delete({
            where: {
              sessionId_chatJid_id: {
                sessionId,
                chatJid: lidJid,
                id: msg.id,
              },
            },
          });
        } else {
          // Re-assign to canonical phone chat
          await prisma.message.update({
            where: {
              sessionId_chatJid_id: {
                sessionId,
                chatJid: lidJid,
                id: msg.id,
              },
            },
            data: {
              chatJid: phoneJid,
            },
          });
        }
      }

      // 2. If phone chat already exists, combine metadata and delete LID chat
      if (phoneChat) {
        const phoneDate = phoneChat.lastMessageAt?.getTime() || 0;
        const lidDate = lidChat.lastMessageAt?.getTime() || 0;
        const useLidLatest = lidDate > phoneDate;

        await prisma.chat.update({
          where: { sessionId_jid: { sessionId, jid: phoneJid } },
          data: {
            unreadCount: (phoneChat.unreadCount || 0) + (lidChat.unreadCount || 0),
            isPinned: phoneChat.isPinned || lidChat.isPinned,
            aiEnabled: phoneChat.aiEnabled || lidChat.aiEnabled,
            isArchived: phoneChat.isArchived && lidChat.isArchived,
            isMuted: phoneChat.isMuted || lidChat.isMuted,
            ...(useLidLatest
              ? {
                  lastMessageId: lidChat.lastMessageId,
                  lastMessageText: lidChat.lastMessageText,
                  lastMessageAt: lidChat.lastMessageAt,
                  lastMessageFromMe: lidChat.lastMessageFromMe,
                }
              : {}),
          },
        });

        await prisma.chat.delete({
          where: { sessionId_jid: { sessionId, jid: lidJid } },
        });

        console.log(`[MergeService] Merged duplicate LID chat ${lidJid} into phone chat ${phoneJid}`);
        return true;
      }

      // 3. If only LID chat existed, rename its JID to the canonical phone JID
      await prisma.chat.create({
        data: {
          sessionId,
          jid: phoneJid,
          type: lidChat.type,
          name: lidChat.name,
          lastMessageId: lidChat.lastMessageId,
          lastMessageText: lidChat.lastMessageText,
          lastMessageAt: lidChat.lastMessageAt,
          lastMessageFromMe: lidChat.lastMessageFromMe,
          unreadCount: lidChat.unreadCount,
          isPinned: lidChat.isPinned,
          isArchived: lidChat.isArchived,
          isMuted: lidChat.isMuted,
          aiEnabled: lidChat.aiEnabled,
        },
      });

      await prisma.chat.delete({
        where: { sessionId_jid: { sessionId, jid: lidJid } },
      });

      console.log(`[MergeService] Promoted LID chat ${lidJid} to canonical phone chat ${phoneJid}`);
      return true;
    } catch (err) {
      console.error(`[MergeService] Failed to merge chats ${lidJid} -> ${phoneJid}:`, err);
      return false;
    }
  }

  /**
   * Backfill job that:
   * 1. Merges any existing duplicate LID/phone chats.
   * 2. Re-resolves last message metadata for chats with missing preview text.
   * 3. Syncs contact names to chat records where appropriate.
   */
  public async backfillSession(sessionId: string): Promise<{ mergedChats: number; updatedChats: number }> {
    let mergedChats = 0;
    let updatedChats = 0;

    console.log(`[MergeService] Running backfill for session ${sessionId}...`);

    // 1. Merge chats for all contacts that have both jid and lid
    const contactsWithLid = await prisma.contact.findMany({
      where: {
        sessionId,
        lid: { not: null },
      },
    });

    for (const c of contactsWithLid) {
      if (c.lid && c.jid && c.jid !== c.lid && c.jid.includes('@s.whatsapp.net')) {
        const merged = await this.mergeLidAndPhoneChats(sessionId, c.jid, c.lid);
        if (merged) mergedChats++;
      }
    }

    // 2. Backfill chats missing lastMessage metadata
    const allChats = await prisma.chat.findMany({
      where: { sessionId },
    });

    for (const chat of allChats) {
      if (!chat.lastMessageText || !chat.lastMessageAt) {
        const latestMsg = await prisma.message.findFirst({
          where: { sessionId, chatJid: chat.jid },
          orderBy: { timestamp: 'desc' },
        });

        if (latestMsg) {
          const previewText = latestMsg.text || latestMsg.caption || latestMsg.mediaFileName || 'Message';
          await prisma.chat.update({
            where: { sessionId_jid: { sessionId, jid: chat.jid } },
            data: {
              lastMessageId: latestMsg.id,
              lastMessageText: previewText,
              lastMessageAt: latestMsg.timestamp,
              lastMessageFromMe: latestMsg.fromMe,
            },
          });
          updatedChats++;
        }
      }
    }

    console.log(
      `[MergeService] Backfill complete for session ${sessionId}: merged ${mergedChats} chats, updated ${updatedChats} chats`,
    );

    return { mergedChats, updatedChats };
  }
}

export const mergeService = new MergeService();
