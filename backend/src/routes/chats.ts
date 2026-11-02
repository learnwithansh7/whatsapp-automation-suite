import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/auth.js';
import { resolveDisplayName } from '../whatsapp/nameResolver.js';
import { avatarQueue } from '../services/avatarQueue.js';
import { aboutService } from '../services/aboutService.js';
import { sessionManager } from '../whatsapp/sessionManager.js';
import { getIO } from '../lib/io.js';
import { extractUrls, linkPreviewService } from '../services/linkPreviewService.js';

const listChatsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(30),
  cursor: z.string().optional(),
  search: z.string().optional(),
  filter: z.enum(['all', 'unread', 'groups', 'archived', 'pinned']).default('all'),
});

const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(), // timestamp ISO or message ID
});

const pinChatSchema = z.object({
  pinned: z.boolean(),
});

const archiveChatSchema = z.object({
  archived: z.boolean(),
});

const muteChatSchema = z.object({
  duration: z.enum(['8h', '1w', 'always']).nullable(),
});

const markUnreadChatSchema = z.object({
  unread: z.boolean(),
});

const sharedMediaQuerySchema = z.object({
  type: z.enum(['media', 'docs', 'links', 'starred']),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

/**
 * Helper to fetch last messages in Baileys LastMessageList format for app-state sync.
 */
async function getLastMessagesForSync(sessionId: string, chatJid: string) {
  const msgs = await prisma.message.findMany({
    where: { sessionId, chatJid, isDeleted: false },
    orderBy: { timestamp: 'desc' },
    take: 5,
  });

  return msgs.map((m) => ({
    key: {
      id: m.id,
      remoteJid: m.chatJid,
      fromMe: m.fromMe,
      participant: m.senderJid || undefined,
    },
    messageTimestamp: Math.floor(new Date(m.timestamp).getTime() / 1000),
  }));
}

export const chatRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Apply auth hook (no-op when AUTH_ENABLED=false)
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/sessions/:sessionId/chats
   * List chats sorted by pinned then lastMessageAt with filter tabs & unread counts.
   */
  app.get('/sessions/:sessionId/chats', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const query = listChatsQuerySchema.safeParse(request.query);

    if (!query.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: query.error.format(),
      });
    }

    const { limit, cursor, search, filter } = query.data;

    const whereClause: Record<string, unknown> = {
      sessionId,
    };

    // Apply filter tab
    switch (filter) {
      case 'all':
        whereClause.isArchived = false;
        break;
      case 'unread':
        whereClause.isArchived = false;
        whereClause.OR = [
          { unreadCount: { gt: 0 } },
          { markedUnread: true },
        ];
        break;
      case 'groups':
        whereClause.isArchived = false;
        whereClause.type = 'group';
        break;
      case 'archived':
        whereClause.isArchived = true;
        break;
      case 'pinned':
        whereClause.isPinned = true;
        break;
    }

    // Apply optional search filter
    if (search && search.trim().length > 0) {
      const s = search.trim();
      const searchConditions = [
        { name: { contains: s, mode: 'insensitive' } },
        { jid: { contains: s, mode: 'insensitive' } },
        { lastMessageText: { contains: s, mode: 'insensitive' } },
      ];

      if (whereClause.OR) {
        whereClause.AND = [
          { OR: whereClause.OR },
          { OR: searchConditions },
        ];
        delete whereClause.OR;
      } else {
        whereClause.OR = searchConditions;
      }
    }

    // Compute unread totals per tab
    const [allCount, unreadTabCount, groupsCount, archivedCount, pinnedCount, chats] = await Promise.all([
      prisma.chat.count({ where: { sessionId, isArchived: false } }),
      prisma.chat.count({
        where: {
          sessionId,
          isArchived: false,
          OR: [{ unreadCount: { gt: 0 } }, { markedUnread: true }],
        },
      }),
      prisma.chat.count({ where: { sessionId, isArchived: false, type: 'group' } }),
      prisma.chat.count({ where: { sessionId, isArchived: true } }),
      prisma.chat.count({ where: { sessionId, isPinned: true } }),
      prisma.chat.findMany({
        where: whereClause,
        orderBy: [
          { isPinned: 'desc' },
          { pinnedAt: { sort: 'desc', nulls: 'last' } },
          { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          { updatedAt: 'desc' },
        ],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    ]);

    const hasMore = chats.length > limit;
    const items = hasMore ? chats.slice(0, limit) : chats;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    // Attach contact info (profile picture, display name, about)
    const chatJids = items.map((c) => c.jid);
    const contacts = await prisma.contact.findMany({
      where: {
        sessionId,
        jid: { in: chatJids },
      },
    });

    const contactMap = new Map(contacts.map((c) => [c.jid, c]));

    const enrichedChats = items.map((chat) => {
      const contact = contactMap.get(chat.jid);
      const displayName = resolveDisplayName({
        savedName: contact?.savedName || contact?.name,
        groupSubject: chat.type === 'group' ? chat.name : null,
        verifiedName: contact?.verifiedName,
        pushName: contact?.pushName,
        phoneNumber: contact?.phoneNumber,
        jid: chat.jid,
      });

      // Lazy avatar enqueue if needed
      avatarQueue.shouldFetchAvatar(sessionId, chat.jid).then((needed) => {
        if (needed) avatarQueue.enqueue(sessionId, chat.jid, 'preview');
      }).catch(() => {});

      const profilePictureUrl =
        contact?.profilePictureStatus === 'ok'
          ? `/api/avatars/${sessionId}/${encodeURIComponent(chat.jid)}`
          : null;

      return {
        ...chat,
        displayName,
        profilePictureUrl,
        pushName: contact?.pushName || null,
        phoneNumber: contact?.phoneNumber || null,
        aboutText: contact?.aboutText || null,
      };
    });

    return reply.send({
      chats: enrichedChats,
      nextCursor,
      counts: {
        all: allCount,
        unread: unreadTabCount,
        groups: groupsCount,
        archived: archivedCount,
        pinned: pinnedCount,
      },
    });
  });

  /**
   * GET /api/sessions/:sessionId/chats/:jid
   * Chat metadata, contact details (including aboutText & verified status), and group participants.
   */
  app.get('/sessions/:sessionId/chats/:jid', async (request, reply) => {
    const { sessionId, jid } = request.params as { sessionId: string; jid: string };

    const chat = await prisma.chat.findUnique({
      where: {
        sessionId_jid: { sessionId, jid },
      },
    });

    if (!chat) {
      return reply.status(404).send({ error: 'Chat not found' });
    }

    const contact = await prisma.contact.findUnique({
      where: {
        sessionId_jid: { sessionId, jid },
      },
    });

    // Lazy enqueue full-res image fetch for opened chat
    avatarQueue.enqueue(sessionId, jid, 'image');

    // Trigger lazy fetch of contact's About text if 1-on-1 chat
    if (chat.type !== 'group') {
      aboutService
        .getOrFetchAbout(sessionId, jid, () => sessionManager.getSocket(sessionId) || null)
        .catch(() => {});
    }

    let participants: unknown[] = [];
    if (chat.type === 'group') {
      const groupParticipants = await prisma.groupParticipant.findMany({
        where: {
          sessionId,
          groupJid: jid,
        },
      });

      const participantJids = groupParticipants.map((p) => p.participantJid);
      const participantContacts = await prisma.contact.findMany({
        where: {
          sessionId,
          jid: { in: participantJids },
        },
      });

      const participantContactMap = new Map(participantContacts.map((c) => [c.jid, c]));

      participants = groupParticipants.map((p) => {
        const c = participantContactMap.get(p.participantJid);
        const name = resolveDisplayName({
          savedName: c?.savedName || c?.name,
          verifiedName: c?.verifiedName,
          pushName: c?.pushName,
          phoneNumber: c?.phoneNumber,
          jid: p.participantJid,
        });

        const profilePictureUrl =
          c?.profilePictureStatus === 'ok'
            ? `/api/avatars/${sessionId}/${encodeURIComponent(p.participantJid)}`
            : null;

        return {
          jid: p.participantJid,
          role: p.role,
          name,
          profilePictureUrl,
          phoneNumber: c?.phoneNumber || null,
        };
      });
    }

    const displayName = resolveDisplayName({
      savedName: contact?.savedName || contact?.name,
      groupSubject: chat.type === 'group' ? chat.name : null,
      verifiedName: contact?.verifiedName,
      pushName: contact?.pushName,
      phoneNumber: contact?.phoneNumber,
      jid: chat.jid,
    });

    const profilePictureUrl =
      contact?.profilePictureStatus === 'ok'
        ? `/api/avatars/${sessionId}/${encodeURIComponent(chat.jid)}`
        : null;

    return reply.send({
      chat: {
        ...chat,
        displayName,
        profilePictureUrl,
        pushName: contact?.pushName || null,
        phoneNumber: contact?.phoneNumber || null,
        aboutText: contact?.aboutText || null,
        verifiedName: contact?.verifiedName || null,
      },
      contact: contact || null,
      participants,
    });
  });

  /**
   * POST /api/sessions/:sessionId/chats/:jid/pin
   * Pin or unpin a chat (max 3 pinned chats). Syncs with WhatsApp phone.
   */
  app.post('/sessions/:sessionId/chats/:jid/pin', async (request, reply) => {
    const { sessionId, jid } = request.params as { sessionId: string; jid: string };
    const parsed = pinChatSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.format() });
    }

    const { pinned } = parsed.data;

    // Enforce max 3 pinned chats rule
    if (pinned) {
      const currentPinned = await prisma.chat.count({
        where: {
          sessionId,
          isPinned: true,
          NOT: { jid },
        },
      });

      if (currentPinned >= 3) {
        return reply.status(400).send({
          error: 'Maximum 3 chats can be pinned at the same time.',
          code: 'PIN_LIMIT_EXCEEDED',
        });
      }
    }

    const updated = await prisma.chat.update({
      where: { sessionId_jid: { sessionId, jid } },
      data: {
        isPinned: pinned,
        pinnedAt: pinned ? new Date() : null,
      },
    });

    // Sync with WhatsApp phone via Baileys app-patch
    const sock = sessionManager.getSocket(sessionId);
    if (sock) {
      sock.chatModify({ pin: pinned }, jid).catch((err) => {
        console.warn(`[Baileys] chatModify pin error for ${jid}:`, err.message);
      });
    }

    getIO()?.to(`session:${sessionId}`).emit('chat.updated', {
      sessionId,
      chat: updated,
    });

    return reply.send({ success: true, chat: updated, syncStatus: 'synced' });
  });

  /**
   * POST /api/sessions/:sessionId/chats/:jid/archive
   * Archive or unarchive a chat. Syncs with WhatsApp phone.
   */
  app.post('/sessions/:sessionId/chats/:jid/archive', async (request, reply) => {
    const { sessionId, jid } = request.params as { sessionId: string; jid: string };
    const parsed = archiveChatSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.format() });
    }

    const { archived } = parsed.data;

    const updated = await prisma.chat.update({
      where: { sessionId_jid: { sessionId, jid } },
      data: {
        isArchived: archived,
        archivedAt: archived ? new Date() : null,
      },
    });

    // WhatsApp MD requires lastMessages list for archiveChatAction
    const sock = sessionManager.getSocket(sessionId);
    if (sock) {
      getLastMessagesForSync(sessionId, jid)
        .then((lastMessages) => sock.chatModify({ archive: archived, lastMessages }, jid))
        .catch((err) => console.warn(`[Baileys] chatModify archive error for ${jid}:`, err.message));
    }

    getIO()?.to(`session:${sessionId}`).emit('chat.updated', {
      sessionId,
      chat: updated,
    });

    return reply.send({ success: true, chat: updated, syncStatus: 'synced' });
  });

  /**
   * POST /api/sessions/:sessionId/chats/:jid/mute
   * Mute for 8 hours, 1 week, always, or unmute (null). Syncs with WhatsApp phone.
   */
  app.post('/sessions/:sessionId/chats/:jid/mute', async (request, reply) => {
    const { sessionId, jid } = request.params as { sessionId: string; jid: string };
    const parsed = muteChatSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.format() });
    }

    const { duration } = parsed.data;
    let mutedUntil: Date | null = null;
    let isMuted = false;
    let muteEndMs: number | null = null;

    if (duration === '8h') {
      const ms = 8 * 3600 * 1000;
      mutedUntil = new Date(Date.now() + ms);
      isMuted = true;
      muteEndMs = mutedUntil.getTime();
    } else if (duration === '1w') {
      const ms = 7 * 24 * 3600 * 1000;
      mutedUntil = new Date(Date.now() + ms);
      isMuted = true;
      muteEndMs = mutedUntil.getTime();
    } else if (duration === 'always') {
      mutedUntil = new Date('2099-12-31T23:59:59.999Z');
      isMuted = true;
      muteEndMs = -1; // -1 triggers indefinite mute in WhatsApp Baileys protocol
    }

    const updated = await prisma.chat.update({
      where: { sessionId_jid: { sessionId, jid } },
      data: {
        isMuted,
        mutedUntil,
      },
    });

    const sock = sessionManager.getSocket(sessionId);
    if (sock) {
      sock.chatModify({ mute: muteEndMs }, jid).catch((err) => {
        console.warn(`[Baileys] chatModify mute error for ${jid}:`, err.message);
      });
    }

    getIO()?.to(`session:${sessionId}`).emit('chat.updated', {
      sessionId,
      chat: updated,
    });

    return reply.send({ success: true, chat: updated, syncStatus: 'synced' });
  });

  /**
   * POST /api/sessions/:sessionId/chats/:jid/mark-unread
   * Mark as unread (displays green dot) or mark as read. Marked as Local Only in UI.
   */
  app.post('/sessions/:sessionId/chats/:jid/mark-unread', async (request, reply) => {
    const { sessionId, jid } = request.params as { sessionId: string; jid: string };
    const parsed = markUnreadChatSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.format() });
    }

    const { unread } = parsed.data;

    const updated = await prisma.chat.update({
      where: { sessionId_jid: { sessionId, jid } },
      data: {
        markedUnread: unread,
        ...(unread ? {} : { unreadCount: 0 }),
      },
    });

    // Attempt WhatsApp sync via markRead
    const sock = sessionManager.getSocket(sessionId);
    if (sock) {
      getLastMessagesForSync(sessionId, jid)
        .then((lastMessages) => sock.chatModify({ markRead: !unread, lastMessages }, jid))
        .catch((err) => console.warn(`[Baileys] chatModify markRead error:`, err.message));
    }

    getIO()?.to(`session:${sessionId}`).emit('chat.updated', {
      sessionId,
      chat: updated,
    });

    // Mark as local_only per instructions
    return reply.send({ success: true, chat: updated, syncStatus: 'local_only' });
  });

  /**
   * POST /api/sessions/:sessionId/chats/:jid/ai-toggle
   * Toggle or set AI auto-reply for a specific chat.
   */
  app.post('/sessions/:sessionId/chats/:jid/ai-toggle', async (request, reply) => {
    const { sessionId, jid } = request.params as { sessionId: string; jid: string };
    const body = (request.body as { enabled?: boolean }) || {};

    const existing = await prisma.chat.findUnique({
      where: { sessionId_jid: { sessionId, jid } },
      select: { aiEnabled: true },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Chat not found' });
    }

    const nextAiEnabled = typeof body.enabled === 'boolean' ? body.enabled : !existing.aiEnabled;

    const updated = await prisma.chat.update({
      where: { sessionId_jid: { sessionId, jid } },
      data: { aiEnabled: nextAiEnabled },
    });

    getIO()?.to(`session:${sessionId}`).emit('chat.updated', {
      sessionId,
      chat: updated,
    });

    return reply.send({ success: true, chat: updated, aiEnabled: updated.aiEnabled });
  });

  /**
   * GET /api/sessions/:sessionId/chats/:jid/shared
   * Shared media tabs for the open chat: Media (photos & videos), Documents, Links, Starred messages.
   */
  app.get('/sessions/:sessionId/chats/:jid/shared', async (request, reply) => {
    const { sessionId, jid } = request.params as { sessionId: string; jid: string };
    const query = sharedMediaQuerySchema.safeParse(request.query);

    if (!query.success) {
      return reply.status(400).send({ error: 'Invalid query parameters', details: query.error.format() });
    }

    const { type, cursor, limit } = query.data;

    let cursorDate: Date | undefined;
    if (cursor) {
      const d = new Date(cursor);
      if (!isNaN(d.getTime())) cursorDate = d;
    }

    const baseWhere = {
      sessionId,
      chatJid: jid,
      isDeleted: false,
      hiddenLocally: false,
      ...(cursorDate ? { timestamp: { lt: cursorDate } } : {}),
    };

    if (type === 'media') {
      const messages = await prisma.message.findMany({
        where: {
          ...baseWhere,
          type: { in: ['image', 'video'] },
        },
        orderBy: { timestamp: 'desc' },
        take: limit + 1,
      });

      const hasMore = messages.length > limit;
      const items = hasMore ? messages.slice(0, limit) : messages;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].timestamp.toISOString() : null;

      const mediaItems = items.map((m) => ({
        id: m.id,
        type: m.type,
        caption: m.caption,
        mediaFileName: m.mediaFileName,
        mediaSize: m.mediaSize,
        durationSeconds: m.durationSeconds,
        timestamp: m.timestamp,
        mediaUrl: m.mediaPath ? `/api/media/${sessionId}/${m.id}` : null,
      }));

      return reply.send({ items: mediaItems, nextCursor, hasMore });
    }

    if (type === 'docs') {
      const messages = await prisma.message.findMany({
        where: {
          ...baseWhere,
          type: 'document',
        },
        orderBy: { timestamp: 'desc' },
        take: limit + 1,
      });

      const hasMore = messages.length > limit;
      const items = hasMore ? messages.slice(0, limit) : messages;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].timestamp.toISOString() : null;

      const docItems = items.map((m) => ({
        id: m.id,
        name: m.mediaFileName || 'Document',
        size: m.mediaSize || 0,
        mime: m.mediaMime || 'application/octet-stream',
        timestamp: m.timestamp,
        downloadUrl: m.mediaPath ? `/api/media/${sessionId}/${m.id}` : null,
      }));

      return reply.send({ items: docItems, nextCursor, hasMore });
    }

    if (type === 'links') {
      // Find messages containing http/https links
      const messages = await prisma.message.findMany({
        where: {
          ...baseWhere,
          OR: [
            { text: { contains: 'http', mode: 'insensitive' } },
            { caption: { contains: 'http', mode: 'insensitive' } },
          ],
        },
        orderBy: { timestamp: 'desc' },
        take: limit + 1,
      });

      const hasMore = messages.length > limit;
      const items = hasMore ? messages.slice(0, limit) : messages;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].timestamp.toISOString() : null;

      const linkItems = await Promise.all(
        items.map(async (m) => {
          const rawText = m.text || m.caption || '';
          const urls = extractUrls(rawText);
          const firstUrl = urls[0] || '';

          let previewData = null;
          if (firstUrl) {
            previewData = await prisma.linkPreview.findUnique({
              where: { url: firstUrl },
            });
          }

          return {
            id: m.id,
            url: firstUrl,
            title: previewData?.title || firstUrl,
            description: previewData?.description || null,
            imageUrl: previewData?.imagePath
              ? `/api/previews/${previewData.imagePath}/image`
              : previewData?.imageUrl || null,
            timestamp: m.timestamp,
            rawText,
          };
        }),
      );

      return reply.send({ items: linkItems.filter((i) => Boolean(i.url)), nextCursor, hasMore });
    }

    if (type === 'starred') {
      const messages = await prisma.message.findMany({
        where: {
          ...baseWhere,
          isStarred: true,
        },
        orderBy: { timestamp: 'desc' },
        take: limit + 1,
      });

      const hasMore = messages.length > limit;
      const items = hasMore ? messages.slice(0, limit) : messages;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].timestamp.toISOString() : null;

      const starredItems = items.map((m) => ({
        ...m,
        mediaUrl: m.mediaPath ? `/api/media/${sessionId}/${m.id}` : null,
      }));

      return reply.send({ items: starredItems, nextCursor, hasMore });
    }

    return reply.status(400).send({ error: 'Unsupported shared type' });
  });

  /**
   * POST /api/sessions/:sessionId/chats/:jid/mark-read-local
   * Set unreadCount to 0 and markedUnread to false locally in DB.
   */
  app.post('/sessions/:sessionId/chats/:jid/mark-read-local', async (request, reply) => {
    const { sessionId, jid } = request.params as { sessionId: string; jid: string };

    try {
      const updated = await prisma.chat.update({
        where: {
          sessionId_jid: { sessionId, jid },
        },
        data: {
          unreadCount: 0,
          markedUnread: false,
        },
      });

      return reply.send({
        success: true,
        unreadCount: 0,
        chat: updated,
      });
    } catch {
      return reply.status(404).send({ error: 'Chat not found' });
    }
  });

  /**
   * GET /api/sessions/:sessionId/chats/:jid/messages
   * Paginated chat messages with reactions and sender names.
   */
  app.get('/sessions/:sessionId/chats/:jid/messages', async (request, reply) => {
    const { sessionId, jid } = request.params as { sessionId: string; jid: string };
    const query = listMessagesQuerySchema.safeParse(request.query);

    if (!query.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: query.error.format(),
      });
    }

    const { limit, cursor } = query.data;

    let cursorDate: Date | undefined;
    if (cursor) {
      const d = new Date(cursor);
      if (!isNaN(d.getTime())) {
        cursorDate = d;
      }
    }

    const messages = await prisma.message.findMany({
      where: {
        sessionId,
        chatJid: jid,
        hiddenLocally: false,
        ...(cursorDate ? { timestamp: { lt: cursorDate } } : {}),
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;
    const reversed = [...items].reverse();
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].timestamp.toISOString() : null;

    const messageIds = reversed.map((m) => m.id);
    const reactions = await prisma.reaction.findMany({
      where: {
        sessionId,
        chatJid: jid,
        messageId: { in: messageIds },
      },
    });

    const reactionMap = new Map<string, typeof reactions>();
    for (const r of reactions) {
      const list = reactionMap.get(r.messageId) || [];
      list.push(r);
      reactionMap.set(r.messageId, list);
    }

    const senderJids = Array.from(
      new Set(reversed.map((m) => m.senderJid).filter(Boolean) as string[]),
    );

    const senderContacts = await prisma.contact.findMany({
      where: {
        sessionId,
        jid: { in: senderJids },
      },
    });

    const senderMap = new Map(senderContacts.map((c) => [c.jid, c]));

    const enrichedMessages = reversed.map((msg) => {
      let senderName: string | undefined;
      if (msg.senderJid) {
        const sc = senderMap.get(msg.senderJid);
        senderName = resolveDisplayName({
          savedName: sc?.savedName || sc?.name,
          verifiedName: sc?.verifiedName,
          pushName: sc?.pushName,
          phoneNumber: sc?.phoneNumber,
          jid: msg.senderJid,
        });
      }
      return {
        ...msg,
        senderName,
        reactions: reactionMap.get(msg.id) || [],
        mediaUrl: msg.mediaPath ? `/api/media/${sessionId}/${msg.id}` : null,
      };
    });

    return reply.send({
      messages: enrichedMessages,
      nextCursor,
      hasMore,
    });
  });
};
