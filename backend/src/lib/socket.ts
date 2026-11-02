import { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cookie from 'cookie';
import { verifyToken } from './auth.js';
import { env } from '../config/env.js';
import { LOCAL_USER } from '../plugins/auth.js';
import { sessionManager, SessionEvent, ingestionService } from '../whatsapp/index.js';
import { avatarQueue } from '../services/avatarQueue.js';
import { sendQueue } from '../services/sendQueue.js';
import { mediaDownloadQueue } from '../services/mediaDownloadQueue.js';
import { setIO, getIO } from './io.js';
export { getIO } from './io.js';

export function setupSocketIO(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: '/socket.io',
  });
  setIO(io);

  // Authenticate socket connections using JWT cookie or handshake auth
  io.use((socket: Socket, next) => {
    // When AUTH_ENABLED=false, allow all local Socket.IO connections
    if (!env.AUTH_ENABLED) {
      socket.data.user = LOCAL_USER;
      return next();
    }

    try {
      const rawCookie = socket.handshake.headers.cookie;
      let token: string | undefined;

      if (rawCookie) {
        const parsed = cookie.parse(rawCookie);
        token = parsed.token;
      }

      if (!token && socket.handshake.auth?.token) {
        token = socket.handshake.auth.token;
      }

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = verifyToken(token);
      if (!payload) {
        return next(new Error('Invalid or expired authentication token'));
      }

      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Internal authentication error'));
    }
  });

  io.on('connection', (socket) => {
    // On connection, immediately broadcast all current session statuses to this client
    const statuses = sessionManager.getAllStatuses();
    for (const s of statuses) {
      socket.emit('session.status', {
        sessionId: s.sessionId,
        status: s.status,
        phoneNumber: s.phoneNumber || null,
      });

      if (s.qr) {
        socket.emit('session.qr', {
          sessionId: s.sessionId,
          qr: s.qr,
        });
      }
    }
  });

  // Forward internal SessionManager events to connected Socket.IO clients
  sessionManager.onEvent((event: SessionEvent) => {
    if (event.type === 'status') {
      io.emit('session.status', {
        sessionId: event.sessionId,
        status: event.status,
        phoneNumber: event.phoneNumber || null,
        error: event.error || null,
      });
    } else if (event.type === 'qr') {
      io.emit('session.qr', {
        sessionId: event.sessionId,
        qr: event.qr,
      });
    } else if (event.type === 'presence') {
      io.emit('chat.presence', {
        sessionId: event.sessionId,
        chatJid: event.chatJid,
        presences: event.presences,
      });
    }
  });

  // Forward ingestion events to connected clients
  ingestionService.setBroadcaster({
    onNewMessage: (sessionId, message) => {
      const m = message as { id?: string; chatJid?: string; fromMe?: boolean };
      console.log(
        `[Socket Emit: message.new] sessionId=${sessionId}, chatJid=${m.chatJid || 'none'}, id=${m.id || 'none'}, fromMe=${m.fromMe ?? false}`,
      );
      io.emit('message.new', { sessionId, message });
    },
    onUpdateMessage: (sessionId, messageId, chatJid, updates) => {
      const u = updates as { status?: string };
      console.log(
        `[Socket Emit: message.updated] sessionId=${sessionId}, chatJid=${chatJid}, messageId=${messageId}, status=${u.status || 'updated'}`,
      );
      io.emit('message.updated', { sessionId, messageId, chatJid, updates });
    },
    onUpdateChat: (sessionId, chat) => {
      const c = chat as { jid?: string; lastMessageId?: string };
      console.log(
        `[Socket Emit: chat.updated] sessionId=${sessionId}, chatJid=${c.jid || 'none'}, lastMessageId=${c.lastMessageId || 'none'}`,
      );
      io.emit('chat.updated', { sessionId, chat });
    },
    onSyncProgress: (sessionId, processed, total) => {
      console.log(`[Socket Emit: sync.progress] sessionId=${sessionId}, processed=${processed}, total=${total ?? 'none'}`);
      io.emit('sync.progress', { sessionId, processed, total });
    },
    onRequestGroupMetadata: async (sessionId, groupJid) => {
      await sessionManager.fetchGroupMetadata(sessionId, groupJid);
    },
  });

  // Forward avatar downloaded events to connected clients
  avatarQueue.setBroadcaster((sessionId, jid, url) => {
    console.log(`[Socket Emit: avatar.updated] sessionId=${sessionId}, jid=${jid}`);
    io.emit('avatar.updated', { sessionId, jid, url });
  });

  // Forward SendQueue events to connected clients
  sendQueue.setBroadcaster({
    onOptimisticMessage: (sessionId: string, message: unknown) => {
      const m = message as { id?: string; clientId?: string; chatJid?: string };
      console.log(
        `[Socket Emit: message.new (optimistic)] sessionId=${sessionId}, chatJid=${m.chatJid || 'none'}, outboxId=${m.id || 'none'}, clientId=${m.clientId || 'none'}`,
      );
      io.emit('message.new', { sessionId, message });
    },
    onMessageConfirmed: (
      sessionId: string,
      outboxId: string,
      message: unknown,
      clientId?: string,
      updatedChat?: unknown,
    ) => {
      const m = message as { id?: string; chatJid?: string; status?: string };
      console.log(
        `[Socket Emit: message.updated (confirmed)] sessionId=${sessionId}, chatJid=${m.chatJid || 'none'}, outboxId=${outboxId}, clientId=${clientId || 'none'}, messageId=${m.id || 'none'}, status=sent`,
      );
      io.emit('message.updated', {
        sessionId,
        chatJid: m.chatJid,
        clientId: clientId || null,
        messageId: m.id,
        status: 'sent',
        updates: { id: m.id, status: 'sent' },
        message,
      });

      if (updatedChat) {
        const c = updatedChat as { jid?: string; lastMessageId?: string };
        console.log(
          `[Socket Emit: chat.updated (confirmed)] sessionId=${sessionId}, chatJid=${c.jid || m.chatJid || 'none'}, lastMessageId=${c.lastMessageId || m.id || 'none'}`,
        );
        io.emit('chat.updated', { sessionId, chat: updatedChat });
      }

      // Also emit message.confirmed for legacy compatibility
      io.emit('message.confirmed', { sessionId, outboxId, clientId: clientId || null, message });
    },
    onMessageFailed: (
      sessionId: string,
      outboxId: string,
      error: string,
      clientId?: string,
      chatJid?: string,
    ) => {
      console.log(
        `[Socket Emit: message.updated (failed)] sessionId=${sessionId}, chatJid=${chatJid || 'none'}, outboxId=${outboxId}, clientId=${clientId || 'none'}, error=${error}`,
      );
      if (chatJid) {
        io.emit('message.updated', {
          sessionId,
          chatJid,
          clientId: clientId || null,
          messageId: outboxId,
          status: 'failed',
          updates: { status: 'failed' },
          error,
        });
      }
      io.emit('message.failed', { sessionId, outboxId, clientId: clientId || null, error });
    },
    onRateLimitStatus: (
      sessionId: string,
      isLimited: boolean,
      reason?: string,
      resetInSeconds?: number,
    ) => {
      console.log(
        `[Socket Emit: queue.ratelimit] sessionId=${sessionId}, isLimited=${isLimited}`,
      );
      io.emit('queue.ratelimit', { sessionId, isLimited, reason, resetInSeconds });
    },
  });

  // Forward background media download events
  mediaDownloadQueue.setBroadcaster({
    onMediaDownloaded: (sessionId, chatJid, messageId, mediaPath, thumbnail) => {
      io.emit('message.mediaDownloaded', {
        sessionId,
        chatJid,
        messageId,
        mediaPath,
        thumbnail,
      });
    },
    onMediaFailed: (sessionId, chatJid, messageId, error) => {
      io.emit('message.mediaFailed', { sessionId, chatJid, messageId, error });
    },
  });

  return io;
}
