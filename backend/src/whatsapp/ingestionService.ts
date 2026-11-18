import type { proto } from '@whiskeysockets/baileys';
import { prisma } from '../lib/prisma.js';
import {
  parseWAMessage,
  getMessagePreviewText,
  ParsedMessage,
} from './messageParser.js';
import { mergeService } from './mergeService.js';
import { avatarQueue } from '../services/avatarQueue.js';
import { mediaDownloadQueue } from '../services/mediaDownloadQueue.js';
import { getIO } from '../lib/io.js';
import { resolveDisplayName } from './nameResolver.js';
import { aiResponderService } from '../services/aiResponderService.js';

export interface IngestionBroadcaster {
  onNewMessage: (sessionId: string, message: unknown) => void;
  onUpdateMessage: (sessionId: string, messageId: string, chatJid: string, updates: unknown) => void;
  onUpdateChat: (sessionId: string, chat: unknown) => void;
  onSyncProgress: (sessionId: string, processed: number, total?: number) => void;
  onRequestGroupMetadata?: (sessionId: string, groupJid: string) => Promise<void>;
}

class IngestionService {
  private broadcaster: IngestionBroadcaster | null = null;

  public setBroadcaster(broadcaster: IngestionBroadcaster) {
    this.broadcaster = broadcaster;
  }

  /**
   * Resolve whether a JID belongs to a group.
   */
  public isGroupJid(jid: string): boolean {
    return jid.endsWith('@g.us');
  }

  /**
   * Idempotently upsert a Contact into PostgreSQL.
   */
  public async upsertContact(
    sessionId: string,
    data: {
      id: string;
      lid?: string | null;
      name?: string | null;
      notify?: string | null;
      verifiedName?: string | null;
      imgUrl?: string | null;
    },
  ): Promise<void> {
    const jid = data.id;
    const isGroup = this.isGroupJid(jid);
    const phoneNumber = jid.includes('@s.whatsapp.net') ? jid.split('@')[0] : null;
    const savedName = data.name || null;
    const pushName = data.notify || null;
    const verifiedName = data.verifiedName || null;
    const legacyName = savedName || verifiedName || pushName || null;

    try {
      await prisma.contact.upsert({
        where: {
          sessionId_jid: { sessionId, jid },
        },
        create: {
          sessionId,
          jid,
          lid: data.lid || null,
          name: legacyName,
          savedName,
          pushName,
          verifiedName,
          phoneNumber,
          profilePictureUrl: data.imgUrl && data.imgUrl !== 'changed' ? data.imgUrl : null,
          isGroup,
        },
        update: {
          ...(data.lid ? { lid: data.lid } : {}),
          ...(savedName ? { savedName } : {}),
          ...(pushName ? { pushName } : {}),
          ...(verifiedName ? { verifiedName } : {}),
          ...(legacyName ? { name: legacyName } : {}),
          ...(phoneNumber ? { phoneNumber } : {}),
          ...(data.imgUrl && data.imgUrl !== 'changed' ? { profilePictureUrl: data.imgUrl } : {}),
        },
      });

      // If contact maps a Phone JID to a LID, trigger chat merge
      if (data.lid && jid.includes('@s.whatsapp.net') && data.lid.includes('@lid')) {
        mergeService.mergeLidAndPhoneChats(sessionId, jid, data.lid).catch((err) => {
          console.error(`[Ingestion] Error merging LID chat for ${jid}:`, err);
        });
      }

      // Check if avatar needs to be enqueued
      if (data.imgUrl === 'changed') {
        avatarQueue.enqueue(sessionId, jid, 'preview');
      } else {
        avatarQueue.shouldFetchAvatar(sessionId, jid).then((should) => {
          if (should) avatarQueue.enqueue(sessionId, jid, 'preview');
        }).catch(() => {});
      }
    } catch (err) {
      console.error(`[Ingestion] Error upserting contact ${jid}:`, err);
    }
  }

  /**
   * Idempotently ensure a Chat record exists in PostgreSQL.
   */
  public async ensureChat(
    sessionId: string,
    chatJid: string,
    name?: string | null,
  ) {
    const type = this.isGroupJid(chatJid) ? 'group' : 'private';

    try {
      return await prisma.chat.upsert({
        where: {
          sessionId_jid: { sessionId, jid: chatJid },
        },
        create: {
          sessionId,
          jid: chatJid,
          type,
          name: name || null,
        },
        update: {
          ...(name ? { name } : {}),
        },
      });
    } catch (err: unknown) {
      // In concurrent calls, unique constraint P2002 can occur if two upserts run in parallel
      const prismaErr = err as { code?: string };
      if (prismaErr?.code === 'P2002') {
        const existing = await prisma.chat.findUnique({
          where: { sessionId_jid: { sessionId, jid: chatJid } },
        });
        if (existing) return existing;
      }
      console.error(`[Ingestion] Error ensuring chat ${chatJid}:`, err);
      return null;
    }
  }

  /**
   * Ingest and save an incoming or outgoing message into PostgreSQL.
   */
  public async ingestMessage(
    sessionId: string,
    rawMsg: proto.IWebMessageInfo,
    isHistorySync = false,
  ): Promise<ParsedMessage | null> {
    const parsed = parseWAMessage(rawMsg, sessionId);
    if (!parsed) return null;

    // Handle Revocation (Delete for everyone)
    if (parsed.isRevoke && parsed.targetRevokeId) {
      try {
        const deleted = await prisma.message.updateMany({
          where: {
            sessionId,
            chatJid: parsed.chatJid,
            id: parsed.targetRevokeId,
          },
          data: {
            isDeleted: true,
            deletedForEveryone: true,
            deletedAt: new Date(),
          },
        });

        if (deleted.count > 0 && this.broadcaster) {
          this.broadcaster.onUpdateMessage(sessionId, parsed.targetRevokeId, parsed.chatJid, {
            isDeleted: true,
            deletedForEveryone: true,
            deletedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error(`[Ingestion] Failed to mark message ${parsed.targetRevokeId} as deleted:`, err);
      }
      return parsed;
    }

    // Handle incoming Edit message
    if (parsed.isEdit && parsed.targetEditId) {
      try {
        const target = await prisma.message.findUnique({
          where: {
            sessionId_chatJid_id: {
              sessionId,
              chatJid: parsed.chatJid,
              id: parsed.targetEditId,
            },
          },
        });

        if (target) {
          const now = new Date();
          const origText = target.originalText || target.text || null;
          await prisma.message.update({
            where: {
              sessionId_chatJid_id: {
                sessionId,
                chatJid: parsed.chatJid,
                id: parsed.targetEditId,
              },
            },
            data: {
              text: parsed.text,
              originalText: origText,
              editedAt: now,
            },
          });

          if (this.broadcaster) {
            this.broadcaster.onUpdateMessage(sessionId, parsed.targetEditId, parsed.chatJid, {
              text: parsed.text,
              originalText: origText,
              editedAt: now.toISOString(),
            });
          }
        }
      } catch (err) {
        console.error(`[Ingestion] Failed to apply edit to message ${parsed.targetEditId}:`, err);
      }
      return parsed;
    }

    try {
      // 1. Ensure parent Chat exists
      await this.ensureChat(sessionId, parsed.chatJid);

      // Update contact's pushName if present
      if (parsed.senderJid && parsed.pushName) {
        prisma.contact
          .upsert({
            where: { sessionId_jid: { sessionId, jid: parsed.senderJid } },
            create: {
              sessionId,
              jid: parsed.senderJid,
              pushName: parsed.pushName,
              name: parsed.pushName,
              phoneNumber: parsed.senderJid.includes('@s.whatsapp.net')
                ? parsed.senderJid.split('@')[0]
                : null,
              isGroup: false,
            },
            update: {
              pushName: parsed.pushName,
            },
          })
          .catch((err) => {
            console.error(`[Ingestion] Error updating sender pushName for ${parsed.senderJid}:`, err);
          });
      }

      // If group chat has no subject yet, trigger fetchGroupMetadata
      if (this.isGroupJid(parsed.chatJid) && this.broadcaster?.onRequestGroupMetadata) {
        prisma.chat
          .findUnique({
            where: { sessionId_jid: { sessionId, jid: parsed.chatJid } },
          })
          .then((c) => {
            if (!c?.name && this.broadcaster?.onRequestGroupMetadata) {
              this.broadcaster.onRequestGroupMetadata(sessionId, parsed.chatJid).catch(() => {});
            }
          })
          .catch(() => {});
      }

      // 2. Check if message already exists in DB before upsert (e.g. echo of self-sent message)
      const existingMsg = await prisma.message.findUnique({
        where: {
          sessionId_chatJid_id: {
            sessionId,
            chatJid: parsed.chatJid,
            id: parsed.id,
          },
        },
      });
      const isNew = !existingMsg;
      const isContentUpdate = !!(existingMsg && !existingMsg.text && parsed.text);

      let message;
      try {
        message = await prisma.message.upsert({
          where: {
            sessionId_chatJid_id: {
              sessionId,
              chatJid: parsed.chatJid,
              id: parsed.id,
            },
          },
          create: {
            id: parsed.id,
            sessionId,
            chatJid: parsed.chatJid,
            senderJid: parsed.senderJid,
            fromMe: parsed.fromMe,
            type: parsed.type,
            text: parsed.text,
            caption: parsed.caption,
            mediaMime: parsed.mediaMime,
            mediaFileName: parsed.mediaFileName,
            mediaSize: parsed.mediaSize,
            timestamp: parsed.timestamp,
            status: parsed.status,
            replyToMessageId: parsed.replyToMessageId,
            raw: parsed.raw as object,
            isForwarded: parsed.isForwarded ?? false,
            forwardScore: parsed.forwardScore ?? null,
            mentionedJids: parsed.mentionedJids ?? undefined,
          },
          update: {
            status: parsed.status,
            type: parsed.type,
            text: parsed.text,
            caption: parsed.caption,
            mediaMime: parsed.mediaMime,
            mediaFileName: parsed.mediaFileName,
            mediaSize: parsed.mediaSize,
            raw: parsed.raw as object,
            isForwarded: parsed.isForwarded ?? false,
            forwardScore: parsed.forwardScore ?? null,
            mentionedJids: parsed.mentionedJids ?? undefined,
          },
        });
      } catch (upsertErr: unknown) {
        const pErr = upsertErr as { code?: string };
        if (pErr?.code === 'P2002') {
          message = await prisma.message.findUnique({
            where: {
              sessionId_chatJid_id: {
                sessionId,
                chatJid: parsed.chatJid,
                id: parsed.id,
              },
            },
          });
        } else {
          throw upsertErr;
        }
      }

      // 3. Update Chat summary metadata
      const previewText = getMessagePreviewText(
        parsed.type,
        parsed.text,
        parsed.caption,
        parsed.mediaFileName,
      );

      const existingChat = await prisma.chat.findUnique({
        where: { sessionId_jid: { sessionId, jid: parsed.chatJid } },
      });

      const shouldUpdateLastMessage =
        !existingChat?.lastMessageAt || parsed.timestamp >= existingChat.lastMessageAt;

      // Increase unread count if received message and not history sync
      const shouldIncrementUnread = !parsed.fromMe && !isHistorySync;

      let updatedChat = existingChat;
      try {
        updatedChat = await prisma.chat.update({
          where: {
            sessionId_jid: { sessionId, jid: parsed.chatJid },
          },
          data: {
            ...(shouldUpdateLastMessage
              ? {
                  lastMessageId: parsed.id,
                  lastMessageText: previewText,
                  lastMessageAt: parsed.timestamp,
                  lastMessageFromMe: parsed.fromMe,
                }
              : {}),
            ...(shouldIncrementUnread
              ? {
                  unreadCount: { increment: 1 },
                }
              : {}),
          },
        });
      } catch (chatUpdateErr) {
        console.error(`[Ingestion] Failed to update chat summary for ${parsed.chatJid}:`, chatUpdateErr);
      }

      // Automatically enqueue background media download if applicable
      if (
        ['image', 'video', 'audio', 'document', 'sticker'].includes(parsed.type) &&
        mediaDownloadQueue.shouldAutoDownload(parsed.type, parsed.mediaSize)
      ) {
        mediaDownloadQueue.enqueue(sessionId, parsed.chatJid, parsed.id);
      }

      // 4. Real-time broadcast if live (not initial bulk sync)
      if (!isHistorySync && this.broadcaster && message) {
        if (isNew || isContentUpdate) {
          this.broadcaster.onNewMessage(sessionId, message);
          if (updatedChat) {
            this.broadcaster.onUpdateChat(sessionId, updatedChat);
          }

          // Trigger Phase 5 AI Auto-Reply pipeline (checks safety, chat toggle, 10s human delay)
          aiResponderService.handleIncomingMessage(sessionId, parsed.chatJid, {
            id: parsed.id,
            fromMe: parsed.fromMe,
            text: parsed.text,
            caption: parsed.caption,
          }).catch((err) => console.error('[Ingestion] AI auto-reply error:', err));
        } else {
          // Message already existed in DB (e.g. echo from Outbox sendQueue) -> do not emit duplicate onNewMessage
          if (existingMsg && existingMsg.status !== parsed.status) {
            this.broadcaster.onUpdateMessage(sessionId, parsed.id, parsed.chatJid, { status: parsed.status });
          }
        }
      }

      return parsed;
    } catch (err) {
      console.error(`[Ingestion] Failed to ingest message ${parsed.id}:`, err);
      return null;
    }
  }

  /**
   * Update message status (sent, delivered, read) and notify clients.
   */
  public async updateMessageStatus(
    sessionId: string,
    chatJid: string,
    messageId: string,
    status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed',
  ): Promise<void> {
    try {
      await prisma.message.updateMany({
        where: {
          sessionId,
          chatJid,
          id: messageId,
        },
        data: {
          status,
        },
      });

      if (this.broadcaster) {
        this.broadcaster.onUpdateMessage(sessionId, messageId, chatJid, { status });
      }
    } catch (err) {
      console.error(`[Ingestion] Failed to update status for message ${messageId}:`, err);
    }
  }

  /**
   * Process historical sync data delivered by WhatsApp during pairing.
   */
  public async ingestHistorySync(
    sessionId: string,
    data: {
      chats?: Array<{ id: string; name?: string | null; unreadCount?: number | null }>;
      contacts?: Array<{
        id: string;
        name?: string | null;
        notify?: string | null;
        verifiedName?: string | null;
        imgUrl?: string | null;
      }>;
      messages?: proto.IWebMessageInfo[];
      progress?: number | null;
    },
  ): Promise<void> {
    console.log(
      `[Ingestion] Ingesting history sync: ${data.chats?.length || 0} chats, ${data.contacts?.length || 0} contacts, ${data.messages?.length || 0} messages`,
    );

    // 1. Ingest historical contacts
    if (data.contacts && data.contacts.length > 0) {
      for (const c of data.contacts) {
        try {
          await this.upsertContact(sessionId, c);
        } catch (e) {
          console.error('[Ingestion] Error upserting historical contact:', e);
        }
      }
    }

    // 2. Ingest historical chats
    if (data.chats && data.chats.length > 0) {
      for (const ch of data.chats) {
        try {
          await this.ensureChat(sessionId, ch.id, ch.name);
        } catch (e) {
          console.error('[Ingestion] Error ensuring historical chat:', e);
        }
      }
    }

    // 3. Ingest historical messages
    let processed = 0;
    if (data.messages && data.messages.length > 0) {
      const total = data.messages.length;
      for (const m of data.messages) {
        try {
          await this.ingestMessage(sessionId, m, true);
        } catch (e) {
          console.error('[Ingestion] Error ingesting historical message:', e);
        }
        processed++;

        if (processed % 50 === 0 && this.broadcaster) {
          this.broadcaster.onSyncProgress(sessionId, processed, total);
        }
      }

      if (this.broadcaster) {
        this.broadcaster.onSyncProgress(sessionId, processed, total);
      }
    }

    console.log(`[Ingestion] Completed history sync: ${processed} messages ingested into PostgreSQL`);

    // 4. Trigger backfill to merge duplicate LID/phone chats
    mergeService.backfillSession(sessionId).catch((err) => {
      console.error(`[Ingestion] Error running backfill after history sync for ${sessionId}:`, err);
    });
  }

  /**
   * Ingest incoming reactions from Baileys messages.reaction event.
   */
  public async ingestReaction(
    sessionId: string,
    reactionItem: {
      key?: { remoteJid?: string | null; id?: string | null; participant?: string | null; fromMe?: boolean | null } | null;
      reaction?: {
        text?: string | null;
        key?: { remoteJid?: string | null; id?: string | null; participant?: string | null; fromMe?: boolean | null } | null;
        senderTimestampMs?: number | unknown;
      } | null;
    },
  ): Promise<void> {
    const targetKey = reactionItem.reaction?.key || reactionItem.key;
    if (!targetKey || !targetKey.id || !targetKey.remoteJid) return;

    const chatJid = targetKey.remoteJid;
    const messageId = targetKey.id;
    const emoji = reactionItem.reaction?.text || '';

    // Reactor identification
    const reactorJid =
      reactionItem.key?.participant ||
      (reactionItem.key?.fromMe ? 'me' : reactionItem.key?.remoteJid) ||
      'unknown';

    try {
      if (emoji) {
        await prisma.reaction.upsert({
          where: {
            sessionId_chatJid_messageId_reactorJid: {
              sessionId,
              chatJid,
              messageId,
              reactorJid,
            },
          },
          create: {
            sessionId,
            chatJid,
            messageId,
            reactorJid,
            emoji,
            timestamp: new Date(),
          },
          update: {
            emoji,
            timestamp: new Date(),
          },
        });
      } else {
        await prisma.reaction.deleteMany({
          where: {
            sessionId,
            chatJid,
            messageId,
            reactorJid,
          },
        });
      }

      const io = getIO();
      if (io) {
        io.emit('reaction.updated', {
          sessionId,
          chatJid,
          messageId,
          reactorJid,
          emoji: emoji || null,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`[Ingestion] Error ingesting reaction for message ${messageId}:`, err);
    }
  }

  /**
   * Ingest group participant updates.
   */
  public async updateGroupParticipants(
    sessionId: string,
    groupJid: string,
    participants: string[],
    action: 'add' | 'remove' | 'promote' | 'demote' | 'modify',
  ): Promise<void> {
    try {
      if (action === 'remove') {
        await prisma.groupParticipant.deleteMany({
          where: {
            sessionId,
            groupJid,
            participantJid: { in: participants },
          },
        });
      } else {
        const role = action === 'promote' ? 'admin' : 'participant';
        for (const pJid of participants) {
          await prisma.groupParticipant.upsert({
            where: {
              sessionId_groupJid_participantJid: {
                sessionId,
                groupJid,
                participantJid: pJid,
              },
            },
            create: {
              sessionId,
              groupJid,
              participantJid: pJid,
              role,
            },
            update: {
              role,
            },
          });
        }
      }

      // Generate a human-readable system message for the group chat
      for (const pJid of participants) {
        const contact = await prisma.contact.findUnique({
          where: { sessionId_jid: { sessionId, jid: pJid } },
        });
        const name = resolveDisplayName({
          savedName: contact?.savedName || contact?.name,
          pushName: contact?.pushName,
          phoneNumber: contact?.phoneNumber,
          jid: pJid,
        });

        let noticeText = '';
        if (action === 'add') noticeText = `${name} joined the group`;
        else if (action === 'remove') noticeText = `${name} left the group`;
        else if (action === 'promote') noticeText = `${name} is now an admin`;
        else if (action === 'demote') noticeText = `${name} is no longer an admin`;

        if (noticeText) {
          const systemMsgId = `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const sysMsg = await prisma.message.create({
            data: {
              id: systemMsgId,
              sessionId,
              chatJid: groupJid,
              fromMe: false,
              type: 'system',
              text: noticeText,
              timestamp: new Date(),
              status: 'delivered',
            },
          });

          if (this.broadcaster) {
            this.broadcaster.onNewMessage(sessionId, sysMsg);
          }
        }
      }

      // Emit group.participants.updated
      const io = getIO();
      if (io) {
        io.emit('group.participants.updated', {
          sessionId,
          groupJid,
          participants,
          action,
        });
      }
    } catch (err) {
      console.error(`[Ingestion] Error updating group participants for ${groupJid}:`, err);
    }
  }
}

export const ingestionService = new IngestionService();
