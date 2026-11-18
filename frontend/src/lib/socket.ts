import { io, Socket } from 'socket.io-client';
import type { QueryClient } from '@tanstack/react-query';
import type { Session, MessageItem, ChatItem } from './api';
import { useUIStore } from '../store/useUIStore';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      withCredentials: true,
      autoConnect: true,
    });
  }
  return socket;
}

export function initSocketListeners(queryClient: QueryClient): () => void {
  const s = getSocket();

  // Ensure socket connects if autoConnect was deferred
  if (!s.connected) {
    s.connect();
  }

  // 1. Connection lifecycle handlers
  const handleConnect = () => {
    console.log('[Socket.IO] Connected successfully. Socket ID:', s.id);
    useUIStore.getState().setIsSocketConnected(true);

    // On reconnect, refetch stale queries so nothing was missed while disconnected
    queryClient.invalidateQueries({ queryKey: ['chats'] });
    queryClient.invalidateQueries({ queryKey: ['messages'] });
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
  };

  const handleDisconnect = (reason: string) => {
    console.warn('[Socket.IO] Disconnected. Reason:', reason);
    useUIStore.getState().setIsSocketConnected(false);
  };

  const handleConnectError = (error: Error) => {
    console.warn('[Socket.IO] Connection error:', error.message);
    useUIStore.getState().setIsSocketConnected(false);
  };

  // 2. Re-sync when browser tab becomes visible again
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      console.log('[Tab Visibility] Visible. Refetching latest chats and messages...');
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // 3. Session status & QR updates
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

  // 4. Real-time Message Ingestion (message.new)
  const handleNewMessage = (data: { sessionId: string; message: MessageItem }) => {
    const { sessionId, message } = data;
    console.log('[Socket Event: message.new]', {
      id: message.id,
      clientId: message.clientId,
      chatJid: message.chatJid,
      fromMe: message.fromMe,
      type: message.type,
    });

    // 1. Direct TanStack cache update for the chat list row (preview text, time, unread count, move to top)
    queryClient.setQueriesData<{ chats: ChatItem[] }>({ queryKey: ['chats', sessionId] }, (old) => {
      if (!old || !old.chats) return old;
      const previewText =
        message.text ||
        message.caption ||
        (message.type === 'audio' ? 'Voice message' : message.type === 'image' ? 'Photo' : message.type);

      const chatIndex = old.chats.findIndex((c) => c.jid === message.chatJid);
      if (chatIndex !== -1) {
        const targetChat = old.chats[chatIndex];
        const updatedChat: ChatItem = {
          ...targetChat,
          lastMessageId: message.id,
          lastMessageText: previewText,
          lastMessageAt: message.timestamp,
          lastMessageFromMe: message.fromMe,
          unreadCount: !message.fromMe ? (targetChat.unreadCount || 0) + 1 : targetChat.unreadCount,
        };
        const rest = old.chats.filter((_, idx) => idx !== chatIndex);
        return { ...old, chats: [updatedChat, ...rest] };
      } else {
        // Fallback invalidate to fetch brand new conversation
        queryClient.invalidateQueries({ queryKey: ['chats', sessionId] });
        return old;
      }
    });

    // 2. Direct cache update for the messages infinite query (setQueriesData)
    queryClient.setQueriesData<{
      pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
      pageParams: unknown[];
    }>(
      { queryKey: ['messages', sessionId, message.chatJid] },
      (old) => {
        if (!old || !old.pages || old.pages.length === 0) return old;

        // Check if message already exists by id OR by matching clientId
        let replaced = false;
        const updatedPages = old.pages.map((page) => ({
          ...page,
          messages: page.messages.map((m) => {
            const matchesId = m.id === message.id;
            const matchesClient =
              (m.clientId && message.clientId && m.clientId === message.clientId) ||
              (m.id && message.clientId && m.id === message.clientId);
            if (matchesId || matchesClient) {
              replaced = true;
              return { ...m, ...message };
            }
            return m;
          }),
        }));

        if (replaced) {
          return { ...old, pages: updatedPages };
        }

        // Append to the last page of the infinite query
        const lastIdx = old.pages.length - 1;
        const newPages = [...old.pages];
        newPages[lastIdx] = {
          ...newPages[lastIdx],
          messages: [...newPages[lastIdx].messages, message],
        };
        return { ...old, pages: newPages };
      },
    );
  };

  // 5. Real-time Message Updates (message.updated)
  const handleUpdateMessage = (data: {
    sessionId: string;
    messageId: string;
    outboxId?: string;
    chatJid: string;
    clientId?: string | null;
    status?: string;
    updates?: Partial<MessageItem>;
    message?: MessageItem;
  }) => {
    const { sessionId, messageId, outboxId, chatJid, clientId, status, updates, message } = data;
    console.log('[Socket Event: message.updated]', {
      messageId,
      clientId,
      chatJid,
      status: status || updates?.status,
    });

    const finalUpdates: Partial<MessageItem> = {
      ...(updates || {}),
      ...(status ? { status: status as MessageItem['status'] } : {}),
      ...(message || {}),
    };

    // If message was deleted for me (hiddenLocally), remove it from the query cache immediately
    if (finalUpdates.hiddenLocally) {
      queryClient.setQueriesData<{
        pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
        pageParams: unknown[];
      }>(
        { queryKey: ['messages', sessionId, chatJid] },
        (old) => {
          if (!old || !old.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.filter((m) => m.id !== messageId),
            })),
          };
        },
      );
      return;
    }

    // Update message in place in TanStack Query infinite pages
    queryClient.setQueriesData<{
      pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
      pageParams: unknown[];
    }>(
      { queryKey: ['messages', sessionId, chatJid] },
      (old) => {
        if (!old || !old.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => {
              const matchesId = m.id === messageId || (outboxId && m.id === outboxId);
              const matchesClient = clientId && (m.id === clientId || m.clientId === clientId);
              if (matchesId || matchesClient) {
                return {
                  ...m,
                  ...finalUpdates,
                  id: messageId || m.id, // Replace temp id with real WhatsApp message ID
                  status: (finalUpdates.status || m.status) as MessageItem['status'],
                };
              }
              return m;
            }),
          })),
        };
      },
    );

    // Update chat list row if this was the last message
    queryClient.setQueriesData<{ chats: ChatItem[] }>({ queryKey: ['chats', sessionId] }, (old) => {
      if (!old || !old.chats) return old;
      return {
        ...old,
        chats: old.chats.map((c) => {
          if (c.jid === chatJid && (c.lastMessageId === messageId || (clientId && c.lastMessageId === clientId))) {
            return {
              ...c,
              lastMessageId: messageId,
            };
          }
          return c;
        }),
      };
    });
  };

  // 6. Real-time Chat Summary Updates (chat.updated)
  const handleUpdateChat = (data: { sessionId: string; chat: Partial<ChatItem> & { jid?: string } }) => {
    const { sessionId, chat } = data;
    if (!chat || !chat.jid) return;
    console.log('[Socket Event: chat.updated]', { jid: chat.jid, lastMessageId: chat.lastMessageId });

    queryClient.setQueriesData<{ chats: ChatItem[] }>({ queryKey: ['chats', sessionId] }, (old) => {
      if (!old || !old.chats) return old;
      const chatIndex = old.chats.findIndex((c) => c.jid === chat.jid);
      if (chatIndex === -1) {
        queryClient.invalidateQueries({ queryKey: ['chats', sessionId] });
        return old;
      }

      const updated = { ...old.chats[chatIndex], ...chat };
      const rest = old.chats.filter((_, idx) => idx !== chatIndex);
      return { ...old, chats: [updated, ...rest] };
    });
  };

  // 7. Sync Progress & Avatars
  const handleSyncProgress = (data: {
    sessionId: string;
    processed: number;
    total?: number;
  }) => {
    queryClient.setQueryData(['syncProgress', data.sessionId], data);
    queryClient.invalidateQueries({ queryKey: ['chats', data.sessionId] });
  };

  const handleAvatarUpdated = (data: { sessionId: string; jid: string; url: string }) => {
    queryClient.invalidateQueries({ queryKey: ['chats', data.sessionId] });
    queryClient.invalidateQueries({ queryKey: ['chatDetails', data.sessionId, data.jid] });
  };

  // 8. Legacy compatibility: message.confirmed and message.failed
  const handleMessageConfirmed = (data: {
    sessionId: string;
    outboxId: string;
    clientId?: string | null;
    message: MessageItem;
  }) => {
    handleUpdateMessage({
      sessionId: data.sessionId,
      chatJid: data.message.chatJid,
      messageId: data.message.id,
      clientId: data.clientId || data.outboxId,
      status: 'sent',
      message: data.message,
    });
  };

  const handleMessageFailed = (data: {
    sessionId: string;
    outboxId: string;
    clientId?: string | null;
    error: string;
  }) => {
    queryClient.setQueriesData<{
      pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
      pageParams: unknown[];
    }>(
      { queryKey: ['messages', data.sessionId] },
      (old) => {
        if (!old || !old.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => {
              if (m.id === data.outboxId || (data.clientId && (m.id === data.clientId || m.clientId === data.clientId))) {
                return { ...m, status: 'failed' };
              }
              return m;
            }),
          })),
        };
      },
    );
  };

  const handleMediaDownloaded = (data: {
    sessionId: string;
    chatJid: string;
    messageId: string;
    mediaPath: string;
    thumbnail?: string | null;
  }) => {
    queryClient.setQueriesData<{
      pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
      pageParams: unknown[];
    }>(
      { queryKey: ['messages', data.sessionId, data.chatJid] },
      (old) => {
        if (!old || !old.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) =>
              m.id === data.messageId
                ? {
                    ...m,
                    mediaPath: data.mediaPath,
                    mediaUrl: `/api/media/${data.sessionId}/${data.messageId}`,
                    thumbnail: data.thumbnail || m.thumbnail,
                    mediaDownloadStatus: 'done',
                  }
                : m,
            ),
          })),
        };
      },
    );
  };

  const handlePresence = (data: {
    sessionId: string;
    chatJid: string;
    presences: Record<string, { lastKnownPresence?: string }>;
  }) => {
    queryClient.setQueryData(['presence', data.sessionId, data.chatJid], data.presences);
    queryClient.setQueryData<Record<string, string>>(['chatTyping', data.sessionId], (old = {}) => {
      const presences = Object.values(data.presences || {});
      const active = presences.find(
        (p) => p.lastKnownPresence === 'composing' || p.lastKnownPresence === 'recording',
      );
      if (active) {
        return { ...old, [data.chatJid]: active.lastKnownPresence || 'typing...' };
      }
      const updated = { ...old };
      delete updated[data.chatJid];
      return updated;
    });
  };

  const handleRateLimit = (data: {
    sessionId: string;
    isLimited: boolean;
    reason?: string;
    resetInSeconds?: number;
  }) => {
    queryClient.setQueryData(['rateLimit', data.sessionId], data);
  };

  const handleReactionUpdated = (data: {
    sessionId: string;
    chatJid: string;
    messageId: string;
    reactorJid: string;
    emoji: string | null;
    timestamp: string;
  }) => {
    queryClient.setQueriesData<{
      pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
      pageParams: unknown[];
    }>(
      { queryKey: ['messages', data.sessionId, data.chatJid] },
      (old) => {
        if (!old || !old.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => {
              if (m.id === data.messageId) {
                const existingReactions = m.reactions || [];
                const filtered = existingReactions.filter((r) => r.reactorJid !== data.reactorJid);
                const updatedReactions = data.emoji
                  ? [
                      ...filtered,
                      {
                        id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        sessionId: data.sessionId,
                        chatJid: data.chatJid,
                        messageId: data.messageId,
                        reactorJid: data.reactorJid,
                        emoji: data.emoji,
                        timestamp: data.timestamp,
                      },
                    ]
                  : filtered;
                return {
                  ...m,
                  reactions: updatedReactions,
                };
              }
              return m;
            }),
          })),
        };
      },
    );
  };

  const handleGroupUpdated = (data: {
    sessionId: string;
    group: { jid: string; subject?: string; description?: string | null; announceOnly?: boolean; restrict?: boolean };
  }) => {
    queryClient.invalidateQueries({ queryKey: ['groupDetails', data.sessionId, data.group.jid] });
    queryClient.invalidateQueries({ queryKey: ['chatDetails', data.sessionId, data.group.jid] });
    queryClient.invalidateQueries({ queryKey: ['chats', data.sessionId] });
  };

  const handleGroupParticipantsUpdated = (data: { sessionId: string; groupJid: string }) => {
    queryClient.invalidateQueries({ queryKey: ['groupDetails', data.sessionId, data.groupJid] });
    queryClient.invalidateQueries({ queryKey: ['chatDetails', data.sessionId, data.groupJid] });
  };

  // Register listeners on socket
  s.on('connect', handleConnect);
  s.on('disconnect', handleDisconnect);
  s.on('connect_error', handleConnectError);

  s.on('session.status', handleStatus);
  s.on('session.qr', handleQr);
  s.on('message.new', handleNewMessage);
  s.on('message.updated', handleUpdateMessage);
  s.on('chat.updated', handleUpdateChat);
  s.on('sync.progress', handleSyncProgress);
  s.on('avatar.updated', handleAvatarUpdated);
  s.on('message.confirmed', handleMessageConfirmed);
  s.on('message.failed', handleMessageFailed);
  s.on('message.mediaDownloaded', handleMediaDownloaded);
  s.on('chat.presence', handlePresence);
  s.on('queue.ratelimit', handleRateLimit);
  s.on('reaction.updated', handleReactionUpdated);
  s.on('group.updated', handleGroupUpdated);
  s.on('group.participants.updated', handleGroupParticipantsUpdated);

  // Return unregister cleanup function
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    s.off('connect', handleConnect);
    s.off('disconnect', handleDisconnect);
    s.off('connect_error', handleConnectError);

    s.off('session.status', handleStatus);
    s.off('session.qr', handleQr);
    s.off('message.new', handleNewMessage);
    s.off('message.updated', handleUpdateMessage);
    s.off('chat.updated', handleUpdateChat);
    s.off('sync.progress', handleSyncProgress);
    s.off('avatar.updated', handleAvatarUpdated);
    s.off('message.confirmed', handleMessageConfirmed);
    s.off('message.failed', handleMessageFailed);
    s.off('message.mediaDownloaded', handleMediaDownloaded);
    s.off('chat.presence', handlePresence);
    s.off('queue.ratelimit', handleRateLimit);
    s.off('reaction.updated', handleReactionUpdated);
    s.off('group.updated', handleGroupUpdated);
    s.off('group.participants.updated', handleGroupParticipantsUpdated);
  };
}
