// API client methods for WhatsApp Client frontend

export interface User {
  id: string;
  email: string;
  name?: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  name: string;
  phoneNumber?: string | null;
  status: 'idle' | 'connecting' | 'qr' | 'connected' | 'reconnecting' | 'logged_out' | 'error';
  lastConnectedAt?: string | null;
  lastDisconnectReason?: string | null;
  qr?: string | null;
  createdAt: string;
}

export interface ChatItem {
  id: string;
  sessionId: string;
  jid: string;
  type: 'private' | 'group';
  name?: string | null;
  displayName: string;
  profilePictureUrl?: string | null;
  pushName?: string | null;
  phoneNumber?: string | null;
  lastMessageId?: string | null;
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  lastMessageFromMe?: boolean | null;
  unreadCount: number;
  isPinned: boolean;
  pinnedAt?: string | null;
  isArchived: boolean;
  archivedAt?: string | null;
  isMuted: boolean;
  mutedUntil?: string | null;
  markedUnread?: boolean;
  aiEnabled?: boolean;
  aboutText?: string | null;
  verifiedName?: string | null;
  updatedAt: string;
}

export interface FilterCounts {
  all: number;
  unread: number;
  groups: number;
  archived: number;
  pinned: number;
}

export interface LinkPreviewItem {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  status: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact';
  chatWallpaper: 'plain' | 'subtle' | 'soft';
  enterToSend: boolean;
  sendReadReceipts: boolean;
  showLinkPreviews: boolean;
  antiRevokeEnabled: boolean;
}

export interface StorageStats {
  mediaMB: number;
  avatarsMB: number;
  previewsMB: number;
  totalStorageMB: number;
  totalMessages: number;
  totalChats: number;
  outboxCount: number;
  appVersion: string;
  baileysVersion: string;
  nodeVersion: string;
}

export interface ReactionItem {
  id: string;
  sessionId: string;
  messageId: string;
  chatJid: string;
  reactorJid: string;
  emoji: string;
  timestamp: string;
  fromMe?: boolean;
}

export interface GroupDetails {
  group: {
    id: string;
    sessionId: string;
    jid: string;
    subject: string;
    description: string | null;
    ownerJid: string | null;
    groupCreatedAt: string | null;
    announceOnly: boolean;
    restrict: boolean;
    pictureUrl: string | null;
    isCurrentUserAdmin: boolean;
    participantCount: number;
    updatedAt: string;
  };
  participants: Array<{
    jid: string;
    role: 'participant' | 'admin' | 'superadmin';
    name: string;
    profilePictureUrl: string | null;
    phoneNumber: string | null;
  }>;
}

export interface MessageItem {
  id: string;
  clientId?: string | null;
  sessionId: string;
  chatJid: string;
  senderJid?: string | null;
  senderName?: string | null;
  fromMe: boolean;
  type:
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'sticker'
    | 'location'
    | 'contact'
    | 'reaction'
    | 'system'
    | 'other';
  text?: string | null;
  caption?: string | null;
  mediaMime?: string | null;
  mediaFileName?: string | null;
  mediaSize?: number | null;
  timestamp: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  replyToMessageId?: string | null;
  mediaPath?: string | null;
  mediaUrl?: string | null;
  mediaDownloadStatus?: 'none' | 'pending' | 'done' | 'failed';
  thumbnail?: string | null;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  outboxId?: string | null;
  isDeleted: boolean;
  deletedAt?: string | null;
  deletedForEveryone?: boolean;
  hiddenLocally?: boolean;
  isStarred?: boolean;
  editedAt?: string | null;
  originalText?: string | null;
  isForwarded?: boolean;
  forwardScore?: number | null;
  mentionedJids?: string[] | null;
  reactions?: ReactionItem[];
}

export interface ChatParticipant {
  jid: string;
  role: string;
  name: string;
  profilePictureUrl?: string | null;
}

export interface ChatDetails {
  chat: ChatItem;
  contact?: {
    id: string;
    jid: string;
    name?: string | null;
    pushName?: string | null;
    phoneNumber?: string | null;
    profilePictureUrl?: string | null;
    isGroup: boolean;
  } | null;
  participants: ChatParticipant[];
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const reqHeaders: Record<string, string> = {};
  if (options.body) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(endpoint, {
    ...options,
    credentials: 'include',
    headers: {
      ...reqHeaders,
      ...(options.headers as Record<string, string> || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `HTTP error ${res.status}`);
  }

  return data as T;
}

async function uploadRequest<T>(endpoint: string, formData: FormData): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `HTTP error ${res.status}`);
  }

  return data as T;
}

export const api = {
  // Auth
  canRegister: () => request<{ canRegister: boolean }>('/api/auth/can-register'),
  getMe: () => request<{ user: User }>('/api/auth/me'),
  login: (body: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  register: (body: { email: string; password: string; name?: string }) =>
    request<{ user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  logout: () =>
    request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    }),

  // Sessions
  getSessions: () => request<{ sessions: Session[] }>('/api/sessions'),
  createSession: (name: string) =>
    request<{ session: Session }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  connect: (id: string) =>
    request<{ message: string; status: string; qr?: string | null }>(`/api/sessions/${id}/connect`, {
      method: 'POST',
    }),
  requestPairingCode: (id: string, phoneNumber: string) =>
    request<{ code: string }>(`/api/sessions/${id}/pairing-code`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),
  disconnect: (id: string) =>
    request<{ message: string; status: string }>(`/api/sessions/${id}/disconnect`, {
      method: 'POST',
    }),
  logoutSession: (id: string, deleteData = false) =>
    request<{ message: string; status: string; remoteLogoutSuccess?: boolean }>(
      `/api/sessions/${id}/logout`,
      {
        method: 'POST',
        body: JSON.stringify({ deleteData }),
      },
    ),
  resetSession: (id: string) =>
    request<{ message: string; status: string }>(`/api/sessions/${id}/reset`, {
      method: 'POST',
    }),
  backfillSession: (id: string) =>
    request<{ message: string; mergedChats: number; updatedChats: number }>(`/api/sessions/${id}/backfill`, {
      method: 'POST',
    }),

  // Chats & Messages (Phase 2 & Phase 4B)
  getChats: (
    sessionId: string,
    params?: {
      limit?: number;
      cursor?: string;
      search?: string;
      filter?: 'all' | 'unread' | 'groups' | 'archived' | 'pinned';
    },
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.filter) searchParams.set('filter', params.filter);
    const qs = searchParams.toString();
    return request<{ chats: ChatItem[]; nextCursor: string | null; counts?: FilterCounts }>(
      `/api/sessions/${sessionId}/chats${qs ? `?${qs}` : ''}`,
    );
  },

  getChatDetails: (sessionId: string, jid: string) =>
    request<ChatDetails>(`/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}`),

  getMessages: (sessionId: string, jid: string, params?: { limit?: number; cursor?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    const qs = searchParams.toString();
    return request<{ messages: MessageItem[]; nextCursor: string | null; hasMore: boolean }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/messages${qs ? `?${qs}` : ''}`,
    );
  },

  markReadLocal: (sessionId: string, jid: string) =>
    request<{ success: boolean; unreadCount: number }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/mark-read-local`,
      {
        method: 'POST',
      },
    ),

  // Phase 3 & 4A: Sending & Media & Actions
  sendText: (
    sessionId: string,
    jid: string,
    body: { text: string; quotedMessageId?: string; clientId?: string; mentionedJids?: string[] },
  ) =>
    request<{ message: string; outboxId: string; clientId?: string; optimisticMessage: MessageItem }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/send/text`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),

  sendMedia: (sessionId: string, jid: string, formData: FormData) =>
    uploadRequest<{ message: string; outboxId: string; optimisticMessage: MessageItem }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/send/media`,
      formData,
    ),

  sendVoice: (sessionId: string, jid: string, formData: FormData) =>
    uploadRequest<{ message: string; outboxId: string; optimisticMessage: MessageItem }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/send/voice`,
      formData,
    ),

  // Phase 4A: Groups & Message Actions
  getGroupDetails: (sessionId: string, jid: string) =>
    request<GroupDetails>(`/api/sessions/${sessionId}/groups/${encodeURIComponent(jid)}`),

  reactMessage: (sessionId: string, messageId: string, chatJid: string, emoji: string | null) =>
    request<{ success: boolean; message: string; outboxId: string }>(
      `/api/sessions/${sessionId}/messages/${encodeURIComponent(messageId)}/react`,
      {
        method: 'POST',
        body: JSON.stringify({ chatJid, emoji }),
      },
    ),

  deleteMessageForMe: (sessionId: string, messageId: string, chatJid: string) =>
    request<{ success: boolean; message: string }>(
      `/api/sessions/${sessionId}/messages/${encodeURIComponent(messageId)}/delete-for-me`,
      {
        method: 'POST',
        body: JSON.stringify({ chatJid }),
      },
    ),

  deleteMessageForEveryone: (sessionId: string, messageId: string, chatJid: string) =>
    request<{ success: boolean; message: string; outboxId: string }>(
      `/api/sessions/${sessionId}/messages/${encodeURIComponent(messageId)}/delete-for-everyone`,
      {
        method: 'POST',
        body: JSON.stringify({ chatJid }),
      },
    ),

  editMessage: (sessionId: string, messageId: string, chatJid: string, text: string) =>
    request<{ success: boolean; message: string; outboxId: string }>(
      `/api/sessions/${sessionId}/messages/${encodeURIComponent(messageId)}/edit`,
      {
        method: 'POST',
        body: JSON.stringify({ chatJid, text }),
      },
    ),

  forwardMessage: (sessionId: string, messageId: string, chatJid: string, targetChatJids: string[]) =>
    request<{ success: boolean; message: string; outboxIds: string[] }>(
      `/api/sessions/${sessionId}/messages/${encodeURIComponent(messageId)}/forward`,
      {
        method: 'POST',
        body: JSON.stringify({ chatJid, targetChatJids }),
      },
    ),

  starMessage: (sessionId: string, messageId: string, chatJid: string, star: boolean) =>
    request<{ success: boolean; message: string; outboxId: string }>(
      `/api/sessions/${sessionId}/messages/${encodeURIComponent(messageId)}/star`,
      {
        method: 'POST',
        body: JSON.stringify({ chatJid, star }),
      },
    ),

  getStarredMessages: (sessionId: string) =>
    request<{ starredMessages: (MessageItem & { chatTitle?: string; senderName?: string })[] }>(
      `/api/sessions/${sessionId}/starred`,
    ),

  sendTyping: (sessionId: string, jid: string, state: 'composing' | 'recording' | 'paused') =>
    request<{ success: boolean }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/typing`,
      {
        method: 'POST',
        body: JSON.stringify({ state }),
      },
    ),

  subscribePresence: (sessionId: string, jid: string) =>
    request<{ success: boolean }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/presence/subscribe`,
      {
        method: 'POST',
      },
    ),

  markChatRead: (sessionId: string, jid: string, sendReceipt = false) =>
    request<{ success: boolean }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/read`,
      {
        method: 'POST',
        body: JSON.stringify({ sendReceipt }),
      },
    ),

  downloadMedia: (sessionId: string, jid: string, messageId: string) =>
    request<{ success: boolean; enqueued: boolean }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/messages/${encodeURIComponent(messageId)}/download`,
      {
        method: 'POST',
      },
    ),

  cancelOutbox: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/outbox/${id}`, {
      method: 'DELETE',
    }),

  retryOutbox: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/outbox/${id}/retry`, {
      method: 'POST',
    }),

  // Phase 4B: Chat list tools & shared media & settings
  pinChat: (sessionId: string, jid: string, pinned: boolean) =>
    request<{ success: boolean; chat: ChatItem; syncStatus: string }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/pin`,
      {
        method: 'POST',
        body: JSON.stringify({ pinned }),
      },
    ),

  archiveChat: (sessionId: string, jid: string, archived: boolean) =>
    request<{ success: boolean; chat: ChatItem; syncStatus: string }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/archive`,
      {
        method: 'POST',
        body: JSON.stringify({ archived }),
      },
    ),

  muteChat: (sessionId: string, jid: string, duration: '8h' | '1w' | 'always' | null) =>
    request<{ success: boolean; chat: ChatItem; syncStatus: string }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/mute`,
      {
        method: 'POST',
        body: JSON.stringify({ duration }),
      },
    ),

  markChatUnread: (sessionId: string, jid: string, unread: boolean) =>
    request<{ success: boolean; chat: ChatItem; syncStatus: string }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/mark-unread`,
      {
        method: 'POST',
        body: JSON.stringify({ unread }),
      },
    ),

  getSharedMedia: (
    sessionId: string,
    jid: string,
    params: { type: 'media' | 'docs' | 'links' | 'starred'; cursor?: string; limit?: number },
  ) => {
    const qs = new URLSearchParams();
    qs.set('type', params.type);
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit) qs.set('limit', String(params.limit));
    return request<{ items: any[]; nextCursor: string | null; hasMore: boolean }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/shared?${qs.toString()}`,
    );
  },

  getLinkPreview: (url: string) =>
    request<{ preview: LinkPreviewItem }>(`/api/link-preview?url=${encodeURIComponent(url)}`),

  getSettings: () =>
    request<{ settings: AppSettings }>(`/api/settings`),

  updateSettings: (updates: Partial<AppSettings>) =>
    request<{ success: boolean; settings: AppSettings }>(`/api/settings`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  getStorageStats: () =>
    request<StorageStats>(`/api/settings/storage-stats`),

  clearCache: () =>
    request<{ success: boolean; message: string }>(`/api/settings/clear-cache`, {
      method: 'POST',
    }),

  // Phase 5: AI Auto-Reply & Concierge
  getAiConfig: (sessionId: string) =>
    request<{
      config: AiConfig;
      stats: { todayCount: number; dailyLimit: number; totalEnabledChats: number };
      recentLogs: AiReplyLogItem[];
    }>(`/api/sessions/${sessionId}/ai/config`),

  updateAiConfig: (sessionId: string, updates: Partial<AiConfig>) =>
    request<{ success: boolean; config: AiConfig }>(`/api/sessions/${sessionId}/ai/config`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  toggleChatAi: (sessionId: string, jid: string, enabled?: boolean) =>
    request<{ success: boolean; chat: ChatItem; aiEnabled: boolean }>(
      `/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/ai-toggle`,
      {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      },
    ),
};

export interface AiConfig {
  id?: string;
  sessionId?: string;
  isEnabled: boolean;
  minDelaySec: number;
  maxDelaySec: number;
  cooldownMin: number;
  dailyLimit: number;
  developerBio: string | null;
  youtubeUrl: string | null;
  youtubeSubs: string | null;
  instagramUrl: string | null;
  googleMeetMessage: string | null;
  fallbackMessage: string | null;
}

export interface AiReplyLogItem {
  id: string;
  chatJid: string;
  incomingText: string;
  replyText: string;
  intent: string;
  delaySeconds: number;
  createdAt: string;
}
