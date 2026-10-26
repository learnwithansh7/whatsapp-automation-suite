import { io, Socket } from 'socket.io-client';
import type { QueryClient } from '@tanstack/react-query';
import type { Session } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      withCredentials: true,
      autoConnect: false,
    });
  }
  return socket;
}

export function initSocketListeners(queryClient: QueryClient): () => void {
  const s = getSocket();

  const handleStatus = (data: {
    sessionId: string;
    status: Session['status'];
    phoneNumber?: string | null;
    error?: string | null;
  }) => {
    queryClient.setQueryData<{ sessions: Session[] }>(['sessions'], (old) => {
      if (!old) return old;
      return {
        sessions: old.sessions.map((sess) => {
          if (sess.id === data.sessionId) {
            return {
              ...sess,
              status: data.status,
              phoneNumber: data.phoneNumber !== undefined ? data.phoneNumber : sess.phoneNumber,
              lastDisconnectReason: data.error !== undefined ? data.error : sess.lastDisconnectReason,
              // Clear QR once connected
              qr: data.status === 'connected' ? null : sess.qr,
            };
          }
          return sess;
        }),
      };
    });
  };

  const handleQr = (data: { sessionId: string; qr: string }) => {
    queryClient.setQueryData<{ sessions: Session[] }>(['sessions'], (old) => {
      if (!old) return old;
      return {
        sessions: old.sessions.map((sess) => {
          if (sess.id === data.sessionId) {
            return {
              ...sess,
              status: 'qr',
              qr: data.qr,
            };
          }
          return sess;
        }),
      };
    });
  };

  s.on('session.status', handleStatus);
  s.on('session.qr', handleQr);

  return () => {
    s.off('session.status', handleStatus);
    s.off('session.qr', handleQr);
  };
}
