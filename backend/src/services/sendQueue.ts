import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { mediaStorage } from './mediaStorage.js';
import { getIO } from '../lib/io.js';
import type { WASocket, proto } from '@whiskeysockets/baileys';

export type OutboxKind =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'react'
  | 'delete_for_everyone'
  | 'edit'
  | 'forward'
  | 'star';

export interface CreateOutboxPayload {
  sessionId: string;
  chatJid: string;
  kind: OutboxKind;
  text?: string;
  caption?: string;
  quotedMessageId?: string;
  mediaPath?: string;
  mimeType?: string;
  fileName?: string;
  durationSeconds?: number;
  waveform?: Uint8Array;
  clientId?: string;
  // Phase 4A extensions
  mentionedJids?: string[];
  targetMessageId?: string;
  emoji?: string | null;
  star?: boolean;
  isFromMe?: boolean;
  participantJid?: string;
  forwardScore?: number;
}

export interface RateLimitTracker {
  minuteTimestamps: number[];
  hourTimestamps: number[];
}

export interface QueueBroadcaster {
  onOptimisticMessage: (sessionId: string, message: unknown) => void;
  onMessageConfirmed: (
    sessionId: string,
    outboxId: string,
    message: unknown,
    clientId?: string,
    updatedChat?: unknown,
  ) => void;
  onMessageFailed: (
    sessionId: string,
    outboxId: string,
    error: string,
    clientId?: string,
    chatJid?: string,
  ) => void;
  onRateLimitStatus: (
    sessionId: string,
    isLimited: boolean,
    reason?: string,
    resetInSeconds?: number,
  ) => void;
}

export interface ISendQueue {
  enqueue(payload: CreateOutboxPayload): Promise<{ outboxId: string; optimisticMessage?: unknown }>;
  processQueue(sessionId: string): Promise<void>;
  cancel(outboxId: string): Promise<boolean>;
  retry(outboxId: string): Promise<boolean>;
  isRateLimited(sessionId: string): { isLimited: boolean; reason?: string; resetInSeconds?: number };
  setSocketProvider(fn: (sessionId: string) => WASocket | undefined): void;
  setBroadcaster(broadcaster: QueueBroadcaster): void;
}

export class SendQueueService implements ISendQueue {
  private processingSessions = new Set<string>();
  private rateLimits = new Map<string, RateLimitTracker>();
  private socketProvider: ((sessionId: string) => WASocket | undefined) | null = null;
  private broadcaster: QueueBroadcaster | null = null;

  public setSocketProvider(fn: (sessionId: string) => WASocket | undefined) {
    this.socketProvider = fn;
  }

  public setBroadcaster(broadcaster: QueueBroadcaster) {
    this.broadcaster = broadcaster;
  }

  /**
   * Check whether session exceeds max messages/min or messages/hour limits.
   */
  public isRateLimited(sessionId: string): {
    isLimited: boolean;
    reason?: string;
    resetInSeconds?: number;
  } {
    const now = Date.now();
    let tracker = this.rateLimits.get(sessionId);
    if (!tracker) {
      tracker = { minuteTimestamps: [], hourTimestamps: [] };
      this.rateLimits.set(sessionId, tracker);
    }

    // Clean up timestamps older than 1 minute and 1 hour
    tracker.minuteTimestamps = tracker.minuteTimestamps.filter((t) => now - t < 60_000);
    tracker.hourTimestamps = tracker.hourTimestamps.filter((t) => now - t < 3_600_000);

    if (tracker.minuteTimestamps.length >= env.SEND_MAX_PER_MINUTE) {
      const oldest = tracker.minuteTimestamps[0];
      const resetInSeconds = Math.max(1, Math.ceil((60_000 - (now - oldest)) / 1000));
      return {
        isLimited: true,
        reason: `Rate limit reached: max ${env.SEND_MAX_PER_MINUTE} messages/minute`,
        resetInSeconds,
      };
    }

    if (tracker.hourTimestamps.length >= env.SEND_MAX_PER_HOUR) {
      const oldest = tracker.hourTimestamps[0];
      const resetInSeconds = Math.max(1, Math.ceil((3_600_000 - (now - oldest)) / 1000));
      return {
        isLimited: true,
        reason: `Rate limit reached: max ${env.SEND_MAX_PER_HOUR} messages/hour`,
        resetInSeconds,
      };
    }

    return { isLimited: false };
  }

  private recordSend(sessionId: string) {
    const now = Date.now();
    let tracker = this.rateLimits.get(sessionId);
    if (!tracker) {
      tracker = { minuteTimestamps: [], hourTimestamps: [] };
      this.rateLimits.set(sessionId, tracker);
    }
    tracker.minuteTimestamps.push(now);
    tracker.hourTimestamps.push(now);
  }

  /**
   * Calculate random jitter delay between configured bounds.
   */
  public calculateJitterDelay(): number {
    const min = env.SEND_MIN_DELAY_MS;
    const max = env.SEND_MAX_DELAY_MS;
    return Math.floor(min + Math.random() * (max - min));
  }

  /**
   * Calculate composing presence duration in ms proportional to text length (max 4000ms).
   */
  public calculateComposingDuration(textLength = 0): number {
    return Math.min(4000, Math.max(600, textLength * 50));
  }

  /**
   * Enqueue a new message or message action into the persistent Outbox table.
   */
  public async enqueue(payload: CreateOutboxPayload): Promise<{ outboxId: string; optimisticMessage?: unknown }> {
    const outbox = await prisma.outbox.create({
      data: {
        sessionId: payload.sessionId,
        chatJid: payload.chatJid,
        kind: payload.kind,
        payload: {
          text: payload.text || null,
          caption: payload.caption || null,
          quotedMessageId: payload.quotedMessageId || null,
          mediaPath: payload.mediaPath || null,
          mimeType: payload.mimeType || null,
          fileName: payload.fileName || null,
          durationSeconds: payload.durationSeconds || null,
          clientId: payload.clientId || null,
          mentionedJids: payload.mentionedJids || null,
          targetMessageId: payload.targetMessageId || null,
          emoji: payload.emoji !== undefined ? payload.emoji : null,
          star: payload.star !== undefined ? payload.star : null,
          isFromMe: payload.isFromMe !== undefined ? payload.isFromMe : null,
          participantJid: payload.participantJid || null,
          forwardScore: payload.forwardScore || null,
        },
        status: 'queued',
      },
    });

    let optimisticMessage: unknown = undefined;

    // Only create optimistic bubble for chat-content messages (not silent modifications)
    if (
      payload.kind === 'text' ||
      payload.kind === 'image' ||
      payload.kind === 'video' ||
      payload.kind === 'audio' ||
      payload.kind === 'voice' ||
      payload.kind === 'document' ||
      payload.kind === 'forward'
    ) {
      optimisticMessage = {
        id: outbox.id,
        clientId: payload.clientId || null,
        sessionId: payload.sessionId,
        chatJid: payload.chatJid,
        fromMe: true,
        type: payload.kind === 'voice' ? 'audio' : payload.kind === 'forward' ? 'text' : payload.kind,
        text: payload.text || null,
        caption: payload.caption || null,
        mediaFileName: payload.fileName || null,
        mediaMime: payload.mimeType || null,
        timestamp: outbox.createdAt.toISOString(),
        status: 'pending',
        replyToMessageId: payload.quotedMessageId || null,
        isDeleted: false,
        outboxId: outbox.id,
        durationSeconds: payload.durationSeconds || null,
        isForwarded: payload.kind === 'forward',
        forwardScore: payload.forwardScore || 1,
        mentionedJids: payload.mentionedJids || null,
      };

      if (this.broadcaster) {
        this.broadcaster.onOptimisticMessage(payload.sessionId, optimisticMessage);
      }
    }

    // Trigger processing loop for this session in background
    this.processQueue(payload.sessionId).catch((err) => {
      console.error(`[SendQueue:${payload.sessionId}] Error in processQueue:`, err);
    });

    return { outboxId: outbox.id, optimisticMessage };
  }

  /**
   * Cancel a pending queued message.
   */
  public async cancel(outboxId: string): Promise<boolean> {
    const item = await prisma.outbox.findUnique({ where: { id: outboxId } });
    if (!item || item.status !== 'queued') {
      return false;
    }

    await prisma.outbox.update({
      where: { id: outboxId },
      data: { status: 'cancelled' },
    });

    return true;
  }

  /**
   * Retry a failed message.
   */
  public async retry(outboxId: string): Promise<boolean> {
    const item = await prisma.outbox.findUnique({ where: { id: outboxId } });
    if (!item || item.status !== 'failed') {
      return false;
    }

    await prisma.outbox.update({
      where: { id: outboxId },
      data: {
        status: 'queued',
        attempts: 0,
        lastError: null,
        scheduledFor: new Date(),
      },
    });

    this.processQueue(item.sessionId).catch(console.error);
    return true;
  }

  /**
   * One worker loop per session that sends ONE message at a time.
   */
  public async processQueue(sessionId: string): Promise<void> {
    if (this.processingSessions.has(sessionId)) {
      return;
    }

    this.processingSessions.add(sessionId);

    try {
      while (this.processingSessions.has(sessionId)) {
        // 1. Verify socket is available and connected
        const sock = this.socketProvider ? this.socketProvider(sessionId) : undefined;
        if (!sock) {
          // WhatsApp not connected; keep messages queued until connection opens
          break;
        }

        // 2. Check rate limits
        const rateCheck = this.isRateLimited(sessionId);
        if (rateCheck.isLimited) {
          if (this.broadcaster) {
            this.broadcaster.onRateLimitStatus(
              sessionId,
              true,
              rateCheck.reason,
              rateCheck.resetInSeconds,
            );
          }
          // Sleep until rate limit expires or at least 5 seconds
          const sleepMs = (rateCheck.resetInSeconds || 5) * 1000;
          await new Promise((r) => setTimeout(r, sleepMs));
          continue;
        } else {
          if (this.broadcaster) {
            this.broadcaster.onRateLimitStatus(sessionId, false);
          }
        }

        // 3. Fetch next scheduled queued item
        const item = await prisma.outbox.findFirst({
          where: {
            sessionId,
            status: 'queued',
            scheduledFor: { lte: new Date() },
          },
          orderBy: { createdAt: 'asc' },
        });

        if (!item) {
          // No more pending items
          break;
        }

        // 4. Mark status as sending
        await prisma.outbox.update({
          where: { id: item.id },
          data: { status: 'sending' },
        });

        // 5. Send message with anti-ban delay and presence
        try {
          await this.executeSend(sock, sessionId, item);
          this.recordSend(sessionId);

          // Random anti-ban delay (jitter) between 1.5 - 3.5s before next message
          const jitter = this.calculateJitterDelay();
          await new Promise((r) => setTimeout(r, jitter));
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[SendQueue:${sessionId}] Error sending outbox ${item.id}:`, errMsg);

          const nextAttempts = item.attempts + 1;
          if (nextAttempts < 2) {
            // Retry with exponential backoff (5s, 15s)
            const delayMs = nextAttempts * 5000;
            await prisma.outbox.update({
              where: { id: item.id },
              data: {
                status: 'queued',
                attempts: nextAttempts,
                lastError: errMsg,
                scheduledFor: new Date(Date.now() + delayMs),
              },
            });
          } else {
            // Max retries exceeded -> mark failed
            await prisma.outbox.update({
              where: { id: item.id },
              data: {
                status: 'failed',
                attempts: nextAttempts,
                lastError: errMsg,
              },
            });

            if (this.broadcaster) {
              const itemPayload = (item.payload || {}) as Record<string, unknown>;
              const clientId = typeof itemPayload.clientId === 'string' ? itemPayload.clientId : undefined;
              this.broadcaster.onMessageFailed(sessionId, item.id, errMsg, clientId, item.chatJid);
            }
          }
        }
      }
    } finally {
      this.processingSessions.delete(sessionId);
    }
  }

  /**
   * Execute actual sending via Baileys socket.
   */
  private async executeSend(
    sock: WASocket,
    sessionId: string,
    item: { id: string; sessionId: string; chatJid: string; kind: string; payload: unknown },
  ): Promise<void> {
    const payload = (item.payload || {}) as Record<string, unknown>;
    const chatJid = item.chatJid;

    // Resolve quoted message if any
    let quotedOption: { quoted?: proto.IWebMessageInfo } = {};
    if (typeof payload.quotedMessageId === 'string' && payload.quotedMessageId) {
      const quotedMsg = await prisma.message.findUnique({
        where: {
          sessionId_chatJid_id: {
            sessionId,
            chatJid,
            id: payload.quotedMessageId,
          },
        },
      });
      if (quotedMsg?.raw) {
        quotedOption = { quoted: quotedMsg.raw as unknown as proto.IWebMessageInfo };
      }
    }

    // Handle Action Kinds (React, Delete for everyone, Edit, Star)
    if (item.kind === 'react') {
      const targetMessageId = payload.targetMessageId as string;
      const emoji = (payload.emoji as string | null) || '';
      const isFromMe = !!payload.isFromMe;
      const participantJid = payload.participantJid as string | undefined;

      const result = await sock.sendMessage(chatJid, {
        react: {
          text: emoji,
          key: {
            remoteJid: chatJid,
            id: targetMessageId,
            fromMe: isFromMe,
            participant: participantJid,
          },
        },
      });

      const reactorJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : 'me';

      if (emoji) {
        await prisma.reaction.upsert({
          where: {
            sessionId_chatJid_messageId_reactorJid: {
              sessionId,
              chatJid,
              messageId: targetMessageId,
              reactorJid,
            },
          },
          create: {
            sessionId,
            chatJid,
            messageId: targetMessageId,
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
            messageId: targetMessageId,
            reactorJid,
          },
        });
      }

      const io = getIO();
      if (io) {
        io.emit('reaction.updated', {
          sessionId,
          chatJid,
          messageId: targetMessageId,
          reactorJid,
          emoji: emoji || null,
          timestamp: new Date().toISOString(),
        });
      }

      await prisma.outbox.update({
        where: { id: item.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          messageId: result?.key?.id || item.id,
        },
      });
      return;
    }

    if (item.kind === 'delete_for_everyone') {
      const targetMessageId = payload.targetMessageId as string;
      const result = await sock.sendMessage(chatJid, {
        delete: {
          remoteJid: chatJid,
          id: targetMessageId,
          fromMe: true,
        },
      });

      const now = new Date();
      await prisma.message.updateMany({
        where: { sessionId, chatJid, id: targetMessageId },
        data: {
          isDeleted: true,
          deletedForEveryone: true,
          deletedAt: now,
        },
      });

      const io = getIO();
      if (io) {
        io.emit('message.updated', {
          sessionId,
          chatJid,
          messageId: targetMessageId,
          updates: {
            isDeleted: true,
            deletedForEveryone: true,
            deletedAt: now.toISOString(),
          },
        });
      }

      await prisma.outbox.update({
        where: { id: item.id },
        data: {
          status: 'sent',
          sentAt: now,
          messageId: result?.key?.id || item.id,
        },
      });
      return;
    }

    if (item.kind === 'edit') {
      const targetMessageId = payload.targetMessageId as string;
      const newText = payload.text as string;

      const result = await sock.sendMessage(chatJid, {
        text: newText,
        edit: {
          remoteJid: chatJid,
          id: targetMessageId,
          fromMe: true,
        },
      });

      const existingMsg = await prisma.message.findUnique({
        where: { sessionId_chatJid_id: { sessionId, chatJid, id: targetMessageId } },
      });

      const now = new Date();
      const origText = existingMsg?.originalText || existingMsg?.text || null;

      await prisma.message.updateMany({
        where: { sessionId, chatJid, id: targetMessageId },
        data: {
          originalText: origText,
          text: newText,
          editedAt: now,
        },
      });

      const io = getIO();
      if (io) {
        io.emit('message.updated', {
          sessionId,
          chatJid,
          messageId: targetMessageId,
          updates: {
            text: newText,
            originalText: origText,
            editedAt: now.toISOString(),
          },
        });
      }

      await prisma.outbox.update({
        where: { id: item.id },
        data: {
          status: 'sent',
          sentAt: now,
          messageId: result?.key?.id || item.id,
        },
      });
      return;
    }

    if (item.kind === 'star') {
      const targetMessageId = payload.targetMessageId as string;
      const star = !!payload.star;
      const isFromMe = !!payload.isFromMe;

      await sock.star(chatJid, [{ id: targetMessageId, fromMe: isFromMe }], star);

      await prisma.message.updateMany({
        where: { sessionId, chatJid, id: targetMessageId },
        data: { isStarred: star },
      });

      const io = getIO();
      if (io) {
        io.emit('message.updated', {
          sessionId,
          chatJid,
          messageId: targetMessageId,
          updates: { isStarred: star },
        });
      }

      await prisma.outbox.update({
        where: { id: item.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          messageId: item.id,
        },
      });
      return;
    }

    let result: proto.WebMessageInfo | undefined;
    let isForwardedMessage = false;
    let forwardScoreVal = 0;

    switch (item.kind) {
      case 'text': {
        const text = typeof payload.text === 'string' ? payload.text : '';
        const mentionedJids = Array.isArray(payload.mentionedJids)
          ? (payload.mentionedJids as string[])
          : undefined;

        // Anti-ban: show "composing" presence before sending
        const composingMs = this.calculateComposingDuration(text.length);
        await sock.sendPresenceUpdate('composing', chatJid).catch(() => {});
        await new Promise((r) => setTimeout(r, composingMs));

        result = await sock.sendMessage(
          chatJid,
          {
            text,
            ...(mentionedJids && mentionedJids.length ? { mentions: mentionedJids } : {}),
          },
          quotedOption,
        );

        await sock.sendPresenceUpdate('paused', chatJid).catch(() => {});
        break;
      }

      case 'forward': {
        const targetMessageId = payload.targetMessageId as string;
        const origMsg = await prisma.message.findFirst({
          where: { sessionId, id: targetMessageId },
        });

        if (!origMsg) {
          throw new Error(`Original message ${targetMessageId} not found to forward`);
        }

        isForwardedMessage = true;
        forwardScoreVal = (origMsg.forwardScore || 0) + 1;

        const forwardContext = {
          contextInfo: {
            isForwarded: true,
            forwardingScore: forwardScoreVal,
          },
        };

        if (origMsg.type === 'text') {
          result = await sock.sendMessage(
            chatJid,
            {
              text: origMsg.text || '',
              ...forwardContext,
            },
          );
        } else if (origMsg.mediaPath) {
          const streamData = await mediaStorage.getMediaStream(origMsg.mediaPath);
          if (!streamData) throw new Error('Media file missing for forwarded message');

          const chunks: Buffer[] = [];
          for await (const chunk of streamData.stream) chunks.push(chunk);
          const buffer = Buffer.concat(chunks);

          if (origMsg.type === 'image') {
            result = await sock.sendMessage(
              chatJid,
              {
                image: buffer,
                caption: origMsg.caption || undefined,
                mimetype: origMsg.mediaMime || 'image/jpeg',
                ...forwardContext,
              },
            );
          } else if (origMsg.type === 'video') {
            result = await sock.sendMessage(
              chatJid,
              {
                video: buffer,
                caption: origMsg.caption || undefined,
                mimetype: origMsg.mediaMime || 'video/mp4',
                ...forwardContext,
              },
            );
          } else if (origMsg.type === 'audio') {
            result = await sock.sendMessage(
              chatJid,
              {
                audio: buffer,
                mimetype: origMsg.mediaMime || 'audio/mp4',
                ptt: false,
                ...forwardContext,
              },
            );
          } else {
            result = await sock.sendMessage(
              chatJid,
              {
                document: buffer,
                mimetype: origMsg.mediaMime || 'application/octet-stream',
                fileName: origMsg.mediaFileName || 'document',
                caption: origMsg.caption || undefined,
                ...forwardContext,
              },
            );
          }
        }
        break;
      }

      case 'image': {
        if (typeof payload.mediaPath !== 'string' || !payload.mediaPath) throw new Error('Missing mediaPath for image');
        const streamData = await mediaStorage.getMediaStream(payload.mediaPath);
        if (!streamData) throw new Error('Media file not found on disk');

        const chunks: Buffer[] = [];
        for await (const chunk of streamData.stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        result = await sock.sendMessage(
          chatJid,
          {
            image: buffer,
            caption: typeof payload.caption === 'string' ? payload.caption : undefined,
            mimetype: typeof payload.mimeType === 'string' ? payload.mimeType : 'image/jpeg',
          },
          quotedOption,
        );
        break;
      }

      case 'video': {
        if (typeof payload.mediaPath !== 'string' || !payload.mediaPath) throw new Error('Missing mediaPath for video');
        const streamData = await mediaStorage.getMediaStream(payload.mediaPath);
        if (!streamData) throw new Error('Media file not found on disk');

        const chunks: Buffer[] = [];
        for await (const chunk of streamData.stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        result = await sock.sendMessage(
          chatJid,
          {
            video: buffer,
            caption: typeof payload.caption === 'string' ? payload.caption : undefined,
            mimetype: typeof payload.mimeType === 'string' ? payload.mimeType : 'video/mp4',
          },
          quotedOption,
        );
        break;
      }

      case 'audio': {
        if (typeof payload.mediaPath !== 'string' || !payload.mediaPath) throw new Error('Missing mediaPath for audio');
        const streamData = await mediaStorage.getMediaStream(payload.mediaPath);
        if (!streamData) throw new Error('Media file not found on disk');

        const chunks: Buffer[] = [];
        for await (const chunk of streamData.stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        result = await sock.sendMessage(
          chatJid,
          {
            audio: buffer,
            mimetype: typeof payload.mimeType === 'string' ? payload.mimeType : 'audio/mp4',
            ptt: false,
          },
          quotedOption,
        );
        break;
      }

      case 'voice': {
        if (typeof payload.mediaPath !== 'string' || !payload.mediaPath) throw new Error('Missing mediaPath for voice note');
        const streamData = await mediaStorage.getMediaStream(payload.mediaPath);
        if (!streamData) throw new Error('Voice media file not found on disk');

        const chunks: Buffer[] = [];
        for await (const chunk of streamData.stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        // Send recording presence
        await sock.sendPresenceUpdate('recording', chatJid).catch(() => {});
        await new Promise((r) => setTimeout(r, 1000));

        result = await sock.sendMessage(
          chatJid,
          {
            audio: buffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
            seconds: typeof payload.durationSeconds === 'number' ? payload.durationSeconds : undefined,
          },
          quotedOption,
        );

        await sock.sendPresenceUpdate('paused', chatJid).catch(() => {});
        break;
      }

      case 'document': {
        if (typeof payload.mediaPath !== 'string' || !payload.mediaPath) throw new Error('Missing mediaPath for document');
        const streamData = await mediaStorage.getMediaStream(payload.mediaPath);
        if (!streamData) throw new Error('Document media file not found on disk');

        const chunks: Buffer[] = [];
        for await (const chunk of streamData.stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        result = await sock.sendMessage(
          chatJid,
          {
            document: buffer,
            mimetype: typeof payload.mimeType === 'string' ? payload.mimeType : 'application/octet-stream',
            fileName: typeof payload.fileName === 'string' ? payload.fileName : 'document',
            caption: typeof payload.caption === 'string' ? payload.caption : undefined,
          },
          quotedOption,
        );
        break;
      }
    }

    if (!result || !result.key || !result.key.id) {
      throw new Error('WhatsApp failed to return sent message identifier');
    }

    const whatsappMessageId = result.key.id;
    const sentAt = new Date();

    // 1. Update Outbox record
    await prisma.outbox.update({
      where: { id: item.id },
      data: {
        status: 'sent',
        sentAt,
        messageId: whatsappMessageId,
      },
    });

    // 2. Persist confirmed Message row in PostgreSQL
    const previewText =
      (typeof payload.text === 'string' && payload.text) ||
      (typeof payload.caption === 'string' && payload.caption) ||
      (item.kind === 'voice'
        ? 'Voice message'
        : item.kind === 'image'
          ? 'Photo'
          : item.kind === 'video'
            ? 'Video'
            : (typeof payload.fileName === 'string' && payload.fileName) || 'Document');

    const createdMsg = await prisma.message.create({
      data: {
        id: whatsappMessageId,
        sessionId,
        chatJid,
        fromMe: true,
        type: item.kind === 'voice' ? 'audio' : item.kind === 'forward' ? 'text' : item.kind,
        text: typeof payload.text === 'string' ? payload.text : null,
        caption: typeof payload.caption === 'string' ? payload.caption : null,
        mediaPath: typeof payload.mediaPath === 'string' ? payload.mediaPath : null,
        mediaMime: typeof payload.mimeType === 'string' ? payload.mimeType : null,
        mediaFileName: typeof payload.fileName === 'string' ? payload.fileName : null,
        mediaDownloadStatus: payload.mediaPath ? 'done' : 'none',
        durationSeconds: typeof payload.durationSeconds === 'number' ? payload.durationSeconds : null,
        timestamp: sentAt,
        status: 'sent',
        replyToMessageId: typeof payload.quotedMessageId === 'string' ? payload.quotedMessageId : null,
        raw: result as object,
        isForwarded: isForwardedMessage,
        forwardScore: isForwardedMessage ? forwardScoreVal : null,
        mentionedJids: Array.isArray(payload.mentionedJids) ? payload.mentionedJids : undefined,
      },
    });

    // 3. Update Chat record
    const updatedChat = await prisma.chat.update({
      where: { sessionId_jid: { sessionId, jid: chatJid } },
      data: {
        lastMessageId: whatsappMessageId,
        lastMessageText: previewText,
        lastMessageAt: sentAt,
        lastMessageFromMe: true,
      },
    });

    // 4. Notify frontend via broadcaster
    if (this.broadcaster) {
      const clientId = typeof payload.clientId === 'string' ? payload.clientId : undefined;
      this.broadcaster.onMessageConfirmed(sessionId, item.id, createdMsg, clientId, updatedChat);
    }
  }
}

export const sendQueue: ISendQueue = new SendQueueService();
