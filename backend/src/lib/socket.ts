import { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cookie from 'cookie';
import { verifyToken } from './auth.js';
import { sessionManager, SessionEvent } from '../whatsapp/index.js';

export function setupSocketIO(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: '/socket.io',
  });

  // Authenticate socket connections using JWT cookie or handshake auth
  io.use((socket: Socket, next) => {
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
    }
  });

  return io;
}
