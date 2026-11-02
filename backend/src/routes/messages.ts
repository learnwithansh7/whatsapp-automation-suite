import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/auth.js';
import { sendQueue } from '../services/sendQueue.js';
import { mediaStorage } from '../services/mediaStorage.js';
import { validateUpload } from '../services/mimeDetector.js';
import { convertToWhatsAppVoiceNote } from '../services/voiceConverter.js';
import { mediaDownloadQueue } from '../services/mediaDownloadQueue.js';
import { sessionManager } from '../whatsapp/sessionManager.js';
import { groupService } from '../services/groupService.js';
import { resolveDisplayName } from '../whatsapp/nameResolver.js';
import { getIO } from '../lib/io.js';

const sendTextSchema = z.object({
  text: z.string().min(1, 'Message text cannot be empty'),
  quotedMessageId: z.string().optional(),
  clientId: z.string().optional(),
  mentionedJids: z.array(z.string()).optional(),
});

const reactSchema = z.object({
  chatJid: z.string().min(1, 'chatJid is required'),
  emoji: z.string().nullable().optional(),
});

const deleteForMeSchema = z.object({
  chatJid: z.string().min(1, 'chatJid is required'),
});

const deleteForEveryoneSchema = z.object({
  chatJid: z.string().min(1, 'chatJid is required'),
});

const editMessageSchema = z.object({
  chatJid: z.string().min(1, 'chatJid is required'),
  text: z.string().min(1, 'Edited text cannot be empty'),
});

const forwardMessageSchema = z.object({
  chatJid: z.string().min(1, 'Source chatJid is required'),
  targetChatJids: z
    .array(z.string().min(1))
    .min(1, 'Select at least one chat')
    .max(5, 'Cannot forward to more than 5 chats at once'),
});

const starMessageSchema = z.object({
  chatJid: z.string().min(1, 'chatJid is required'),
  star: z.boolean(),
});

const typingSchema = z.object({
  state: z.enum(['composing', 'recording', 'paused']),
});

const markReadSchema = z.object({
  sendReceipt: z.boolean().optional(),
});

export const messageRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Apply auth guard
  app.addHook('preHandler', requireAuth);

  /**
   * POST /api/sessions/:id/chats/:jid/send/text
   * Send a text message (or quote reply) through the persistent send queue.
   */
  app.post('/sessions/:id/chats/:jid/send/text', async (request, reply) => {
    const { id: sessionId, jid } = request.params as { id: string; jid: string };
    const chatJid = decodeURIComponent(jid);

    // Announce-only group check
    const groupCheck = await groupService.canSendToGroup(sessionId, chatJid);
    if (!groupCheck.allowed) {
      return reply.status(403).send({
        error: groupCheck.reason || 'Only community admins can send messages to this group',
        code: 'ANNOUNCE_ONLY',
      });
    }

    const parsed = sendTextSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const { text, quotedMessageId, clientId, mentionedJids } = parsed.data;

    const result = await sendQueue.enqueue({
      sessionId,
      chatJid,
      kind: 'text',
      text,
      quotedMessageId,
      clientId,
      mentionedJids,
    });

    return reply.status(202).send({
      message: 'Message queued for sending',
      outboxId: result.outboxId,
      clientId: clientId || null,
      optimisticMessage: result.optimisticMessage,
    });
  });

  /**
   * POST /api/sessions/:id/chats/:jid/send/media
   * Multipart file upload (image, video, document, audio) with optional caption and quote.
   */
  app.post('/sessions/:id/chats/:jid/send/media', async (request, reply) => {
    const { id: sessionId, jid } = request.params as { id: string; jid: string };
    const chatJid = decodeURIComponent(jid);

    const groupCheck = await groupService.canSendToGroup(sessionId, chatJid);
    if (!groupCheck.allowed) {
      return reply.status(403).send({
        error: groupCheck.reason || 'Only community admins can send messages to this group',
        code: 'ANNOUNCE_ONLY',
      });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No media file provided in multipart payload' });
    }

    const buffer = await file.toBuffer();
    const caption = (file.fields.caption as { value?: string } | undefined)?.value;
    const quotedMessageId = (file.fields.quotedMessageId as { value?: string } | undefined)?.value;
    const clientId = (file.fields.clientId as { value?: string } | undefined)?.value;

    // Validate magic bytes & size limits
    const validation = validateUpload(buffer);
    if (!validation.valid || !validation.mimeType || !validation.kind) {
      return reply.status(400).send({ error: validation.error || 'Invalid media file' });
    }

    // Save to disk storage
    const saved = await mediaStorage.saveMedia(
      sessionId,
      buffer,
      file.filename,
      validation.mimeType,
    );

    const result = await sendQueue.enqueue({
      sessionId,
      chatJid,
      kind: validation.kind as 'image' | 'video' | 'audio' | 'voice' | 'document',
      mediaPath: saved.relativePath,
      mimeType: validation.mimeType,
      fileName: file.filename,
      caption,
      quotedMessageId,
      clientId,
    });

    return reply.status(202).send({
      message: 'Media queued for sending',
      outboxId: result.outboxId,
      clientId: clientId || null,
      optimisticMessage: result.optimisticMessage,
    });
  });

  /**
   * POST /api/sessions/:id/chats/:jid/send/voice
   * Upload recorded audio blob, convert to WhatsApp-compatible Opus voice note (.ogg), and enqueue.
   */
  app.post('/sessions/:id/chats/:jid/send/voice', async (request, reply) => {
    const { id: sessionId, jid } = request.params as { id: string; jid: string };
    const chatJid = decodeURIComponent(jid);

    const groupCheck = await groupService.canSendToGroup(sessionId, chatJid);
    if (!groupCheck.allowed) {
      return reply.status(403).send({
        error: groupCheck.reason || 'Only community admins can send messages to this group',
        code: 'ANNOUNCE_ONLY',
      });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No audio recorded' });
    }

    const rawBuffer = await file.toBuffer();
    const quotedMessageId = (file.fields.quotedMessageId as { value?: string } | undefined)?.value;
    const clientId = (file.fields.clientId as { value?: string } | undefined)?.value;

    const converted = await convertToWhatsAppVoiceNote(rawBuffer);
    const saved = await mediaStorage.saveMedia(
      sessionId,
      converted.oggBuffer,
      'voice_note.ogg',
      'audio/ogg; codecs=opus',
    );

    const result = await sendQueue.enqueue({
      sessionId,
      chatJid,
      kind: 'voice',
      mediaPath: saved.relativePath,
      mimeType: 'audio/ogg; codecs=opus',
      fileName: 'Voice note',
      durationSeconds: converted.durationSeconds,
      waveform: converted.waveform,
      quotedMessageId,
      clientId,
    });

    return reply.status(202).send({
      message: 'Voice note queued for sending',
      outboxId: result.outboxId,
      clientId: clientId || null,
      optimisticMessage: result.optimisticMessage,
    });
  });

  /**
   * POST /api/sessions/:id/messages/:messageId/react
   * React with an emoji (or null/empty to remove reaction).
   */
  app.post('/sessions/:id/messages/:messageId/react', async (request, reply) => {
    const { id: sessionId, messageId } = request.params as { id: string; messageId: string };
    const parsed = reactSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const { chatJid, emoji } = parsed.data;

    const message = await prisma.message.findUnique({
      where: { sessionId_chatJid_id: { sessionId, chatJid, id: messageId } },
    });

    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    const result = await sendQueue.enqueue({
      sessionId,
      chatJid,
      kind: 'react',
      targetMessageId: messageId,
      emoji: emoji || null,
      isFromMe: message.fromMe,
      participantJid: message.senderJid || undefined,
    });

    return reply.status(202).send({
      success: true,
      message: 'Reaction queued',
      outboxId: result.outboxId,
    });
  });

  /**
   * POST /api/sessions/:id/messages/:messageId/delete-for-me
   * Hides the message locally in the app without contacting WhatsApp.
   */
  app.post('/sessions/:id/messages/:messageId/delete-for-me', async (request, reply) => {
    const { id: sessionId, messageId } = request.params as { id: string; messageId: string };
    const parsed = deleteForMeSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const { chatJid } = parsed.data;

    const message = await prisma.message.findUnique({
      where: { sessionId_chatJid_id: { sessionId, chatJid, id: messageId } },
    });

    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    await prisma.message.update({
      where: { sessionId_chatJid_id: { sessionId, chatJid, id: messageId } },
      data: { hiddenLocally: true },
    });

    const io = getIO();
    if (io) {
      io.emit('message.updated', {
        sessionId,
        chatJid,
        messageId,
        updates: { hiddenLocally: true },
      });
    }

    return reply.send({ success: true, message: 'Message hidden for you' });
  });

  /**
   * POST /api/sessions/:id/messages/:messageId/delete-for-everyone
   * Revoke own message for all recipients (allowed within 48h).
   */
  app.post('/sessions/:id/messages/:messageId/delete-for-everyone', async (request, reply) => {
    const { id: sessionId, messageId } = request.params as { id: string; messageId: string };
    const parsed = deleteForEveryoneSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const { chatJid } = parsed.data;

    const message = await prisma.message.findUnique({
      where: { sessionId_chatJid_id: { sessionId, chatJid, id: messageId } },
    });

    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    if (!message.fromMe) {
      return reply.status(403).send({ error: 'You can only delete your own messages for everyone' });
    }

    // 48 hours time window check
    const ageMs = Date.now() - new Date(message.timestamp).getTime();
    const maxAgeMs = 48 * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      return reply.status(400).send({
        error: 'Message is too old to delete for everyone (time window expired)',
      });
    }

    const result = await sendQueue.enqueue({
      sessionId,
      chatJid,
      kind: 'delete_for_everyone',
      targetMessageId: messageId,
    });

    return reply.status(202).send({
      success: true,
      message: 'Delete for everyone queued',
      outboxId: result.outboxId,
    });
  });

  /**
   * POST /api/sessions/:id/messages/:messageId/edit
   * Edit own sent text message (allowed within 15 minutes).
   */
  app.post('/sessions/:id/messages/:messageId/edit', async (request, reply) => {
    const { id: sessionId, messageId } = request.params as { id: string; messageId: string };
    const parsed = editMessageSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const { chatJid, text } = parsed.data;

    const message = await prisma.message.findUnique({
      where: { sessionId_chatJid_id: { sessionId, chatJid, id: messageId } },
    });

    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    if (!message.fromMe) {
      return reply.status(403).send({ error: 'You can only edit your own messages' });
    }

    if (message.type !== 'text') {
      return reply.status(400).send({ error: 'Only text messages can be edited' });
    }

    // 15 minutes time window check
    const ageMs = Date.now() - new Date(message.timestamp).getTime();
    const maxAgeMs = 15 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      return reply.status(400).send({
        error: 'Messages can only be edited within 15 minutes of sending',
      });
    }

    const result = await sendQueue.enqueue({
      sessionId,
      chatJid,
      kind: 'edit',
      targetMessageId: messageId,
      text,
    });

    return reply.status(202).send({
      success: true,
      message: 'Edit queued',
      outboxId: result.outboxId,
    });
  });

  /**
   * POST /api/sessions/:id/messages/:messageId/forward
   * Forward message to up to 5 chats through the outbox queue.
   */
  app.post('/sessions/:id/messages/:messageId/forward', async (request, reply) => {
    const { id: sessionId, messageId } = request.params as { id: string; messageId: string };
    const parsed = forwardMessageSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const { chatJid, targetChatJids } = parsed.data;

    const message = await prisma.message.findUnique({
      where: { sessionId_chatJid_id: { sessionId, chatJid, id: messageId } },
    });

    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    const outboxIds: string[] = [];

    for (const targetJid of targetChatJids) {
      // Check group announce permissions on target chat
      const canSend = await groupService.canSendToGroup(sessionId, targetJid);
      if (!canSend.allowed) continue;

      const res = await sendQueue.enqueue({
        sessionId,
        chatJid: targetJid,
        kind: 'forward',
        targetMessageId: messageId,
        forwardScore: (message.forwardScore || 0) + 1,
      });

      outboxIds.push(res.outboxId);
    }

    return reply.status(202).send({
      success: true,
      message: `Forward queued to ${outboxIds.length} chat(s)`,
      outboxIds,
    });
  });

  /**
   * POST /api/sessions/:id/messages/:messageId/star
   * Toggle isStarred status and sync to WhatsApp.
   */
  app.post('/sessions/:id/messages/:messageId/star', async (request, reply) => {
    const { id: sessionId, messageId } = request.params as { id: string; messageId: string };
    const parsed = starMessageSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const { chatJid, star } = parsed.data;

    const message = await prisma.message.findUnique({
      where: { sessionId_chatJid_id: { sessionId, chatJid, id: messageId } },
    });

    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    const result = await sendQueue.enqueue({
      sessionId,
      chatJid,
      kind: 'star',
      targetMessageId: messageId,
      star,
      isFromMe: message.fromMe,
    });

    return reply.status(202).send({
      success: true,
      message: star ? 'Message starred' : 'Message unstarred',
      outboxId: result.outboxId,
    });
  });

  /**
   * GET /api/sessions/:id/starred
   * Retrieve all starred messages across chats for the session.
   */
  app.get('/sessions/:id/starred', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };

    const starredMessages = await prisma.message.findMany({
      where: {
        sessionId,
        isStarred: true,
        hiddenLocally: false,
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    const chatJids = Array.from(new Set(starredMessages.map((m) => m.chatJid)));
    const senderJids = Array.from(new Set(starredMessages.map((m) => m.senderJid).filter(Boolean) as string[]));

    const [chats, contacts] = await Promise.all([
      prisma.chat.findMany({ where: { sessionId, jid: { in: chatJids } } }),
      prisma.contact.findMany({ where: { sessionId, jid: { in: [...chatJids, ...senderJids] } } }),
    ]);

    const chatMap = new Map(chats.map((c) => [c.jid, c]));
    const contactMap = new Map(contacts.map((c) => [c.jid, c]));

    const enriched = starredMessages.map((m) => {
      const chat = chatMap.get(m.chatJid);
      const chatContact = contactMap.get(m.chatJid);
      const senderContact = m.senderJid ? contactMap.get(m.senderJid) : undefined;

      const chatTitle = resolveDisplayName({
        savedName: chatContact?.savedName || chatContact?.name,
        groupSubject: chat?.type === 'group' ? chat?.name : null,
        verifiedName: chatContact?.verifiedName,
        pushName: chatContact?.pushName,
        phoneNumber: chatContact?.phoneNumber,
        jid: m.chatJid,
      });

      const senderName = m.fromMe
        ? 'You'
        : resolveDisplayName({
            savedName: senderContact?.savedName || senderContact?.name,
            verifiedName: senderContact?.verifiedName,
            pushName: senderContact?.pushName,
            phoneNumber: senderContact?.phoneNumber,
            jid: m.senderJid || m.chatJid,
          });

      return {
        ...m,
        chatTitle,
        senderName,
        mediaUrl: m.mediaPath ? `/api/media/${sessionId}/${m.id}` : null,
      };
    });

    return reply.send({ starredMessages: enriched });
  });

  /**
   * POST /api/sessions/:id/chats/:jid/typing
   * Send typing or recording presence to WhatsApp server.
   */
  app.post('/sessions/:id/chats/:jid/typing', async (request, reply) => {
    const { id: sessionId, jid } = request.params as { id: string; jid: string };
    const chatJid = decodeURIComponent(jid);

    const parsed = typingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.format() });
    }

    await sessionManager.sendPresence(sessionId, chatJid, parsed.data.state);
    return reply.send({ success: true });
  });

  /**
   * POST /api/sessions/:id/chats/:jid/presence/subscribe
   * Subscribe to live typing presence for the currently opened chat.
   */
  app.post('/sessions/:id/chats/:jid/presence/subscribe', async (request, reply) => {
    const { id: sessionId, jid } = request.params as { id: string; jid: string };
    const chatJid = decodeURIComponent(jid);

    await sessionManager.subscribePresence(sessionId, chatJid);
    return reply.send({ success: true });
  });

  /**
   * POST /api/sessions/:id/chats/:jid/read
   * Mark chat as read locally, and optionally send blue ticks if enabled.
   */
  app.post('/sessions/:id/chats/:jid/read', async (request, reply) => {
    const { id: sessionId, jid } = request.params as { id: string; jid: string };
    const chatJid = decodeURIComponent(jid);

    const parsed = markReadSchema.safeParse(request.body || {});
    const sendReceipt = parsed.success ? parsed.data.sendReceipt : false;

    await sessionManager.markChatRead(sessionId, chatJid, sendReceipt);
    return reply.send({ success: true });
  });

  /**
   * POST /api/sessions/:id/chats/:jid/messages/:messageId/download
   * Manually trigger or retry downloading an incoming media attachment.
   */
  app.post('/sessions/:id/chats/:jid/messages/:messageId/download', async (request, reply) => {
    const { id: sessionId, jid, messageId } = request.params as {
      id: string;
      jid: string;
      messageId: string;
    };
    const chatJid = decodeURIComponent(jid);

    const enqueued = mediaDownloadQueue.enqueue(sessionId, chatJid, messageId, true);
    return reply.send({ success: true, enqueued });
  });

  /**
   * GET /api/media/:sessionId/:messageId
   * Stream stored media file (image, video, audio, voice, doc) with caching headers.
   */
  app.get('/media/:sessionId/:messageId', async (request, reply) => {
    const { sessionId, messageId } = request.params as {
      sessionId: string;
      messageId: string;
    };

    const message = await prisma.message.findFirst({
      where: {
        sessionId,
        id: messageId,
      },
    });

    if (!message || !message.mediaPath) {
      return reply.status(404).send({ error: 'Media file not found or not yet downloaded' });
    }

    const file = await mediaStorage.getMediaStream(message.mediaPath);
    if (!file) {
      return reply.status(404).send({ error: 'Media file missing on disk' });
    }

    return reply
      .header('Content-Type', file.contentType)
      .header('Content-Length', file.size)
      .header('Cache-Control', 'public, max-age=604800, immutable')
      .send(file.stream);
  });

  /**
   * DELETE /api/outbox/:id
   * Cancel a queued message before it is sent.
   */
  app.delete('/outbox/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const cancelled = await sendQueue.cancel(id);
    if (!cancelled) {
      return reply.status(400).send({ error: 'Message cannot be cancelled (already sent or not found)' });
    }
    return reply.send({ success: true, message: 'Message cancelled' });
  });

  /**
   * POST /api/outbox/:id/retry
   * Retry sending a failed message from outbox.
   */
  app.post('/outbox/:id/retry', async (request, reply) => {
    const { id } = request.params as { id: string };
    const retried = await sendQueue.retry(id);
    if (!retried) {
      return reply.status(400).send({ error: 'Message cannot be retried (not in failed state or not found)' });
    }
    return reply.send({ success: true, message: 'Message requeued for sending' });
  });
};
