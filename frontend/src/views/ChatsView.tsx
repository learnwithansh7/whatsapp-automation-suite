import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  MessageSquare,
  MoreVertical,
  Info,
  ChevronLeft,
  ArrowDown,
  Pin,
  RefreshCw,
  QrCode,
  AlertCircle,
  X,
  Star,
  Lock,
  VolumeX,
  Archive,
  HelpCircle,
  Bot,
} from 'lucide-react';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ChatInfoPanel } from '../components/chat/ChatInfoPanel';
import { MessageInput } from '../components/chat/MessageInput';
import { MediaLightbox } from '../components/chat/MediaLightbox';
import { ForwardDialog } from '../components/chat/ForwardDialog';
import { StarredMessagesModal } from '../components/chat/StarredMessagesModal';
import { ChatContextMenu } from '../components/chat/ChatContextMenu';
import { KeyboardShortcutsModal } from '../components/chat/KeyboardShortcutsModal';
import { useUIStore } from '../store/useUIStore';
import { useToastStore } from '../store/useToastStore';
import { api, type ChatItem, type MessageItem, type FilterCounts } from '../lib/api';
import { formatChatTimestamp, formatDateSeparator } from '../lib/formatters';
import { cn } from '../lib/utils';

export const ChatsView: React.FC = () => {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const {
    mobileView,
    setMobileView,
    setActiveNav,
    activeSessionId,
    setActiveSessionId,
    sendReadReceipts,
    density,
    chatWallpaper,
    isSocketConnected,
  } = useUIStore();

  const [selectedChatJid, setSelectedChatJid] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups' | 'archived'>('all');
  const [search, setSearch] = useState<string>('');
  const [showRightPanel, setShowRightPanel] = useState<boolean>(false);
  const [showScrollBottom, setShowScrollBottom] = useState<boolean>(false);
  const [hasNewMessages, setHasNewMessages] = useState<boolean>(false);
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<{
    src: string;
    type: 'image' | 'video';
    fileName?: string;
    caption?: string | null;
  } | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<MessageItem | null>(null);
  const [isForwarding, setIsForwarding] = useState<boolean>(false);
  const [isStarredModalOpen, setIsStarredModalOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [editingMessage, setEditingMessage] = useState<MessageItem | null>(null);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    chat: ChatItem;
    position: { x: number; y: number } | null;
  } | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const prevScrollHeightRef = useRef<number>(0);
  const lastMsgCountRef = useRef<number>(0);

  // 1. Fetch sessions
  const { data: sessionData, isLoading: isLoadingSessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: api.getSessions,
  });

  const primarySession = sessionData?.sessions?.[0] || null;
  const currentSessionId = activeSessionId || primarySession?.id || null;

  useEffect(() => {
    if (primarySession && !activeSessionId) {
      setActiveSessionId(primarySession.id);
    }
  }, [primarySession, activeSessionId, setActiveSessionId]);

  // Real-time presence for selected chat
  const currentChatPresence = queryClient.getQueryData<Record<string, { lastKnownPresence?: string }>>([
    'presence',
    currentSessionId,
    selectedChatJid,
  ]);

  const activePresence = useMemo(() => {
    if (!currentChatPresence) return null;
    const values = Object.values(currentChatPresence);
    const active = values.find(
      (v) => v.lastKnownPresence === 'composing' || v.lastKnownPresence === 'recording',
    );
    if (active?.lastKnownPresence === 'recording') return 'recording voice...';
    if (active?.lastKnownPresence === 'composing') return 'typing...';
    return null;
  }, [currentChatPresence]);

  const typingMap = queryClient.getQueryData<Record<string, string>>(['chatTyping', currentSessionId]);

  const rateLimitData = queryClient.getQueryData<{
    isLimited: boolean;
    reason?: string;
    resetInSeconds?: number;
  }>(['rateLimit', currentSessionId]);

  // Sync Progress indicator from Socket.IO cache
  const syncProgress = queryClient.getQueryData<{
    sessionId: string;
    processed: number;
    total?: number;
  }>(['syncProgress', currentSessionId]);

  // 2. Fetch chats list with filter and search
  const {
    data: chatsResponse,
    isLoading: isLoadingChats,
    refetch: refetchChats,
  } = useQuery<{
    chats: ChatItem[];
    counts?: FilterCounts;
    nextCursor: string | null;
  }>({
    queryKey: ['chats', currentSessionId, filter, search],
    queryFn: () =>
      currentSessionId
        ? api.getChats(currentSessionId, {
            filter,
            search: search.trim() || undefined,
          })
        : Promise.resolve({
            chats: [],
            counts: { all: 0, unread: 0, groups: 0, archived: 0, pinned: 0 },
            nextCursor: null,
          }),
    enabled: !!currentSessionId && primarySession?.status === 'connected',
  });

  const chats = useMemo(() => chatsResponse?.chats || [], [chatsResponse]);
  const filterCounts = useMemo(
    () =>
      chatsResponse?.counts || {
        all: 0,
        unread: 0,
        groups: 0,
        archived: 0,
      },
    [chatsResponse],
  );

  const selectedChat = useMemo(
    () => chats.find((c) => c.jid === selectedChatJid) || null,
    [chats, selectedChatJid],
  );

  // Group details query for announceOnly status
  const { data: groupDetails } = useQuery({
    queryKey: ['groupDetails', currentSessionId, selectedChatJid],
    queryFn: () =>
      currentSessionId && selectedChatJid ? api.getGroupDetails(currentSessionId, selectedChatJid) : null,
    enabled: !!currentSessionId && !!selectedChatJid && selectedChat?.type === 'group',
  });

  // Select first chat automatically on desktop if none selected
  useEffect(() => {
    if (!selectedChatJid && chats.length > 0 && mobileView !== 'chat') {
      const first = chats[0];
      setSelectedChatJid(first.jid);
      if (currentSessionId && first.unreadCount > 0) {
        api.markReadLocal(currentSessionId, first.jid).catch(() => {});
      }
    }
  }, [chats, selectedChatJid, currentSessionId, mobileView]);

  // 3. Fetch infinite messages for selected chat
  const {
    data: messagesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingMessages,
  } = useInfiniteQuery({
    queryKey: ['messages', currentSessionId, selectedChatJid],
    queryFn: ({ pageParam }) =>
      currentSessionId && selectedChatJid
        ? api.getMessages(currentSessionId, selectedChatJid, { cursor: pageParam })
        : Promise.resolve({ messages: [], nextCursor: null, hasMore: false }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor || undefined : undefined),
    enabled: !!currentSessionId && !!selectedChatJid,
  });

  // Flatten messages chronologically: older pages come first
  const allMessages: MessageItem[] = useMemo(() => {
    if (!messagesData?.pages) return [];
    return messagesData.pages
      .slice()
      .reverse()
      .flatMap((p) => p.messages);
  }, [messagesData]);

  // Upward infinite scroll handling
  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNear = distanceFromBottom < 120;
    isNearBottomRef.current = isNear;
    setShowScrollBottom(distanceFromBottom > 200);

    if (isNear) {
      setHasNewMessages(false);
    }

    if (el.scrollTop < 60 && hasNextPage && !isFetchingNextPage) {
      prevScrollHeightRef.current = el.scrollHeight;
      fetchNextPage().then(() => {
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            const heightDiff = messagesContainerRef.current.scrollHeight - prevScrollHeightRef.current;
            messagesContainerRef.current.scrollTop = heightDiff;
          }
        });
      });
    }
  };

  // Scroll to bottom on initial load, when sending, or when incoming message arrives
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || allMessages.length === 0) {
      lastMsgCountRef.current = allMessages.length;
      return;
    }

    const prevCount = lastMsgCountRef.current;
    lastMsgCountRef.current = allMessages.length;

    if (allMessages.length > prevCount) {
      const latestMsg = allMessages[allMessages.length - 1];
      if (latestMsg?.fromMe) {
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        });
        setHasNewMessages(false);
        return;
      }

      if (isNearBottomRef.current) {
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        });
        setHasNewMessages(false);
      } else {
        setHasNewMessages(true);
      }
    }
  }, [allMessages]);

  const scrollToBottom = (smooth = true) => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      setHasNewMessages(false);
    }
  };

  const handleSelectChat = (chat: ChatItem) => {
    setSelectedChatJid(chat.jid);
    setMobileView('chat');
    setReplyingTo(null);
    setEditingMessage(null);

    if (currentSessionId) {
      api.subscribePresence(currentSessionId, chat.jid).catch(() => {});
    }

    if (currentSessionId && (chat.unreadCount > 0 || chat.markedUnread)) {
      api.markChatRead(currentSessionId, chat.jid, sendReadReceipts).catch(() => {});
      queryClient.setQueriesData<{ chats: ChatItem[]; nextCursor: string | null }>(
        { queryKey: ['chats', currentSessionId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            chats: old.chats.map((c) =>
              c.jid === chat.jid ? { ...c, unreadCount: 0, markedUnread: false } : c,
            ),
          };
        },
      );
    }
  };

  // Context Menu Actions (Pin, Archive, Mute, Mark Unread)
  const handlePinChat = async (targetChat: ChatItem) => {
    if (!currentSessionId) return;

    if (!targetChat.isPinned) {
      const pinnedCount = chats.filter((c) => c.isPinned).length;
      if (pinnedCount >= 3) {
        addToast({
          title: 'Pin limit reached',
          message: 'You can only pin up to 3 chats at a time.',
          type: 'error',
        });
        return;
      }
    }

    const nextPinned = !targetChat.isPinned;
    try {
      await api.pinChat(currentSessionId, targetChat.jid, nextPinned);
      queryClient.invalidateQueries({ queryKey: ['chats', currentSessionId] });
      addToast({
        title: nextPinned ? 'Chat Pinned' : 'Chat Unpinned',
        message: nextPinned ? `Pinned "${targetChat.displayName}".` : `Unpinned "${targetChat.displayName}".`,
        type: 'success',
      });
    } catch {
      addToast({
        title: 'Error',
        message: 'Failed to update pin status.',
        type: 'error',
      });
    }
  };

  const handleArchiveChat = async (targetChat: ChatItem) => {
    if (!currentSessionId) return;

    const nextArchived = !targetChat.isArchived;
    try {
      await api.archiveChat(currentSessionId, targetChat.jid, nextArchived);
      queryClient.invalidateQueries({ queryKey: ['chats', currentSessionId] });
      addToast({
        title: nextArchived ? 'Chat Archived' : 'Chat Unarchived',
        message: `${targetChat.displayName} has been ${nextArchived ? 'archived' : 'unarchived'}.`,
        type: 'info',
      });
    } catch {
      addToast({
        title: 'Error',
        message: 'Failed to update archive status.',
        type: 'error',
      });
    }
  };

  const handleMuteChat = async (targetChat: ChatItem, duration: '8h' | '1w' | 'always' | null) => {
    if (!currentSessionId) return;

    try {
      await api.muteChat(currentSessionId, targetChat.jid, duration);
      queryClient.invalidateQueries({ queryKey: ['chats', currentSessionId] });
      addToast({
        title: duration ? 'Chat Muted' : 'Chat Unmuted',
        message: duration
          ? `Muted notifications for ${duration === '8h' ? '8 hours' : duration === '1w' ? '1 week' : 'always'}.`
          : 'Notifications unmuted.',
        type: 'info',
      });
    } catch {
      addToast({
        title: 'Error',
        message: 'Failed to update mute state.',
        type: 'error',
      });
    }
  };

  const handleMarkUnread = async (targetChat: ChatItem) => {
    if (!currentSessionId) return;

    const nextUnread = !(targetChat.markedUnread || targetChat.unreadCount > 0);
    try {
      await api.markChatUnread(currentSessionId, targetChat.jid, nextUnread);
      queryClient.invalidateQueries({ queryKey: ['chats', currentSessionId] });
      addToast({
        title: nextUnread ? 'Marked as unread' : 'Marked as read',
        message: nextUnread ? 'Marked as unread (local only).' : 'Marked as read.',
        type: 'info',
      });
    } catch {
      addToast({
        title: 'Error',
        message: 'Failed to update unread status.',
        type: 'error',
      });
    }
  };

  const handleToggleChatAi = async (targetChat: ChatItem) => {
    if (!currentSessionId) return;
    const nextVal = !targetChat.aiEnabled;
    try {
      await api.toggleChatAi(currentSessionId, targetChat.jid, nextVal);
      queryClient.setQueriesData<{ chats: ChatItem[]; nextCursor: string | null }>(
        { queryKey: ['chats', currentSessionId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            chats: old.chats.map((c) =>
              c.jid === targetChat.jid ? { ...c, aiEnabled: nextVal } : c,
            ),
          };
        },
      );
      addToast({
        title: nextVal ? 'AI Auto-Reply Enabled' : 'AI Auto-Reply Disabled',
        message: nextVal
          ? `AI will respond to incoming messages from "${targetChat.displayName}" after a 10s human reading delay.`
          : `AI auto-reply disabled for "${targetChat.displayName}".`,
        type: 'info',
      });
    } catch {
      addToast({
        title: 'Error',
        message: 'Failed to update AI auto-reply status.',
        type: 'error',
      });
    }
  };

  // Keyboard Navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA';

      // '?' opens shortcuts dialog when not typing in an input
      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setIsShortcutsOpen(true);
        return;
      }

      // Escape handles closing topmost open modal / panel / context menu
      if (e.key === 'Escape') {
        if (isShortcutsOpen) {
          setIsShortcutsOpen(false);
        } else if (contextMenu) {
          setContextMenu(null);
        } else if (isStarredModalOpen) {
          setIsStarredModalOpen(false);
        } else if (lightboxMedia) {
          setLightboxMedia(null);
        } else if (forwardingMessage) {
          setForwardingMessage(null);
        } else if (showRightPanel) {
          setShowRightPanel(false);
        } else if (replyingTo) {
          setReplyingTo(null);
        } else if (editingMessage) {
          setEditingMessage(null);
        }
        return;
      }

      // Ctrl + Shift + P: Toggle pin on active chat
      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p') && selectedChat) {
        e.preventDefault();
        handlePinChat(selectedChat);
        return;
      }

      // Ctrl + Shift + A: Toggle archive on active chat
      if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a') && selectedChat) {
        e.preventDefault();
        handleArchiveChat(selectedChat);
        return;
      }

      // Up / Down arrow navigation across chat list
      if (!isInput && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        if (chats.length === 0) return;
        e.preventDefault();
        const currentIndex = chats.findIndex((c) => c.jid === selectedChatJid);
        let nextIndex = 0;
        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex < chats.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : chats.length - 1;
        }
        const nextChat = chats[nextIndex];
        if (nextChat) {
          handleSelectChat(nextChat);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isShortcutsOpen,
    contextMenu,
    isStarredModalOpen,
    lightboxMedia,
    forwardingMessage,
    showRightPanel,
    replyingTo,
    editingMessage,
    selectedChat,
    chats,
    selectedChatJid,
  ]);

  const handleRetrySend = async (msg: MessageItem) => {
    if (!currentSessionId || !selectedChatJid) return;

    queryClient.setQueriesData<{
      pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
      pageParams: unknown[];
    }>(
      { queryKey: ['messages', currentSessionId, selectedChatJid] },
      (old) => {
        if (!old || !old.pages) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            messages: p.messages.map((m) => (m.id === msg.id ? { ...m, status: 'pending' as const } : m)),
          })),
        };
      },
    );

    try {
      if (msg.outboxId) {
        await api.retryOutbox(msg.outboxId);
      } else if (msg.type === 'text' && msg.text) {
        await api.sendText(currentSessionId, selectedChatJid, {
          text: msg.text,
          quotedMessageId: msg.replyToMessageId || undefined,
          clientId: msg.clientId || msg.id,
        });
      }
    } catch {
      queryClient.setQueriesData<{
        pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
        pageParams: unknown[];
      }>(
        { queryKey: ['messages', currentSessionId, selectedChatJid] },
        (old) => {
          if (!old || !old.pages) return old;
          return {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              messages: p.messages.map((m) => (m.id === msg.id ? { ...m, status: 'failed' as const } : m)),
            })),
          };
        },
      );
    }
  };

  const handleReact = async (messageId: string, emoji: string | null) => {
    if (!currentSessionId || !selectedChatJid) return;

    queryClient.setQueriesData<{
      pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
      pageParams: unknown[];
    }>(
      { queryKey: ['messages', currentSessionId, selectedChatJid] },
      (old) => {
        if (!old || !old.pages) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            messages: p.messages.map((m) => {
              if (m.id !== messageId) return m;
              const existingReactions = m.reactions || [];
              const myReactionIdx = existingReactions.findIndex((r) => r.fromMe || r.reactorJid === 'me');
              const updated = [...existingReactions];
              if (!emoji) {
                if (myReactionIdx >= 0) updated.splice(myReactionIdx, 1);
              } else {
                if (myReactionIdx >= 0) {
                  updated[myReactionIdx] = { ...updated[myReactionIdx], emoji };
                } else {
                  updated.push({
                    id: `temp-${Date.now()}`,
                    sessionId: currentSessionId,
                    messageId,
                    chatJid: selectedChatJid,
                    emoji,
                    reactorJid: 'me',
                    fromMe: true,
                    timestamp: new Date().toISOString(),
                  });
                }
              }
              return { ...m, reactions: updated };
            }),
          })),
        };
      },
    );

    try {
      await api.reactMessage(currentSessionId, messageId, selectedChatJid, emoji);
    } catch {
      queryClient.invalidateQueries({ queryKey: ['messages', currentSessionId, selectedChatJid] });
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast({
      title: 'Copied',
      message: 'Message copied to clipboard.',
      type: 'info',
    });
  };

  const handleForward = (msg: MessageItem) => {
    setForwardingMessage(msg);
  };

  const handleConfirmForward = async (targetChatJids: string[]) => {
    if (!currentSessionId || !forwardingMessage || targetChatJids.length === 0) return;
    setIsForwarding(true);

    try {
      await api.forwardMessage(
        currentSessionId,
        forwardingMessage.id,
        forwardingMessage.chatJid,
        targetChatJids,
      );
      addToast({
        title: 'Forwarded',
        message: `Forwarded to ${targetChatJids.length} ${targetChatJids.length === 1 ? 'chat' : 'chats'}.`,
        type: 'success',
      });
      setForwardingMessage(null);
    } catch {
      addToast({
        title: 'Error',
        message: 'Failed to forward message.',
        type: 'error',
      });
    } finally {
      setIsForwarding(false);
    }
  };

  const handleStar = async (messageId: string, star: boolean) => {
    if (!currentSessionId || !selectedChatJid) return;

    queryClient.setQueriesData<{
      pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
      pageParams: unknown[];
    }>(
      { queryKey: ['messages', currentSessionId, selectedChatJid] },
      (old) => {
        if (!old || !old.pages) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            messages: p.messages.map((m) => (m.id === messageId ? { ...m, isStarred: star } : m)),
          })),
        };
      },
    );

    try {
      await api.starMessage(currentSessionId, messageId, selectedChatJid, star);
    } catch {
      queryClient.invalidateQueries({ queryKey: ['messages', currentSessionId, selectedChatJid] });
    }
  };

  const handleEdit = (msg: MessageItem) => {
    setReplyingTo(null);
    setEditingMessage(msg);
  };

  const handleSaveEdit = async (messageId: string, newText: string) => {
    if (!currentSessionId || !selectedChatJid) return;

    queryClient.setQueriesData<{
      pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
      pageParams: unknown[];
    }>(
      { queryKey: ['messages', currentSessionId, selectedChatJid] },
      (old) => {
        if (!old || !old.pages) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            messages: p.messages.map((m) =>
              m.id === messageId ? { ...m, text: newText, isEdited: true } : m,
            ),
          })),
        };
      },
    );

    try {
      await api.editMessage(currentSessionId, messageId, selectedChatJid, newText);
      setEditingMessage(null);
    } catch {
      addToast({
        title: 'Edit Failed',
        message: 'Could not edit message. Only sent text messages within 15 minutes can be edited.',
        type: 'error',
      });
      queryClient.invalidateQueries({ queryKey: ['messages', currentSessionId, selectedChatJid] });
    }
  };

  const handleTriggerEditLastMessage = () => {
    const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
    const lastEditable = [...allMessages].reverse().find((m) => {
      return (
        m.fromMe &&
        m.type === 'text' &&
        !m.isDeleted &&
        !m.deletedForEveryone &&
        !m.hiddenLocally &&
        new Date(m.timestamp).getTime() >= fifteenMinAgo
      );
    });
    if (lastEditable) {
      setReplyingTo(null);
      setEditingMessage(lastEditable);
    }
  };

  const handleDeleteForMe = async (messageId: string) => {
    if (!currentSessionId || !selectedChatJid) return;

    queryClient.setQueriesData<{
      pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
      pageParams: unknown[];
    }>(
      { queryKey: ['messages', currentSessionId, selectedChatJid] },
      (old) => {
        if (!old || !old.pages) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            messages: p.messages.filter((m) => m.id !== messageId),
          })),
        };
      },
    );

    try {
      await api.deleteMessageForMe(currentSessionId, messageId, selectedChatJid);
    } catch {
      queryClient.invalidateQueries({ queryKey: ['messages', currentSessionId, selectedChatJid] });
    }
  };

  const handleDeleteForEveryone = async (messageId: string) => {
    if (!currentSessionId || !selectedChatJid) return;

    queryClient.setQueriesData<{
      pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
      pageParams: unknown[];
    }>(
      { queryKey: ['messages', currentSessionId, selectedChatJid] },
      (old) => {
        if (!old || !old.pages) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            messages: p.messages.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    isDeleted: true,
                    deletedForEveryone: true,
                    text: 'This message was deleted',
                  }
                : m,
            ),
          })),
        };
      },
    );

    try {
      await api.deleteMessageForEveryone(currentSessionId, messageId, selectedChatJid);
    } catch {
      addToast({
        title: 'Delete Failed',
        message: 'Could not delete for everyone. Must be your message sent within 48 hours.',
        type: 'error',
      });
      queryClient.invalidateQueries({ queryKey: ['messages', currentSessionId, selectedChatJid] });
    }
  };

  const handleJumpToStarredChat = (chatJid: string, messageId: string) => {
    setIsStarredModalOpen(false);
    const targetChat = chats.find((c) => c.jid === chatJid);
    if (targetChat) {
      handleSelectChat(targetChat);
    } else {
      setSelectedChatJid(chatJid);
      setMobileView('chat');
    }
    setTimeout(() => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('bg-accent/15');
        setTimeout(() => el.classList.remove('bg-accent/15'), 2000);
      }
    }, 400);
  };

  // Group messages by date for date dividers
  const groupedMessages = useMemo(() => {
    const groups: { dateLabel: string; messages: MessageItem[] }[] = [];
    let currentDateLabel = '';
    let currentBatch: MessageItem[] = [];

    for (const msg of allMessages) {
      const label = formatDateSeparator(msg.timestamp);
      if (label !== currentDateLabel) {
        if (currentBatch.length > 0) {
          groups.push({ dateLabel: currentDateLabel, messages: currentBatch });
        }
        currentDateLabel = label;
        currentBatch = [msg];
      } else {
        currentBatch.push(msg);
      }
    }

    if (currentBatch.length > 0) {
      groups.push({ dateLabel: currentDateLabel, messages: currentBatch });
    }

    return groups;
  }, [allMessages]);

  // 1. Reconnecting state
  if (!isLoadingSessions && primarySession?.status === 'reconnecting') {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-app">
        <div className="max-w-md w-full bg-surface border border-border-subtle rounded-card p-6 shadow-card text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
          <h3 className="text-lg font-semibold text-text-main tracking-tight">
            Reconnecting to WhatsApp...
          </h3>
          <p className="text-sm text-text-muted mt-2 leading-relaxed">
            {primarySession.lastDisconnectReason || 'Connection closed. Attempting to restore connection...'}
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setActiveNav('connection')}
              className="w-full flex items-center justify-center gap-2"
            >
              View Connection Status
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Error state
  if (!isLoadingSessions && primarySession?.status === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-app">
        <div className="max-w-md w-full bg-surface border border-border-subtle rounded-card p-6 shadow-card text-center">
          <div className="w-12 h-12 rounded-full bg-danger-soft border border-danger/20 text-danger flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-text-main tracking-tight">
            WhatsApp Connection Error
          </h3>
          <p className="text-sm text-text-muted mt-2 leading-relaxed">
            {primarySession.lastDisconnectReason || 'Connection lost. Reconnection attempts failed.'}
          </p>
          <div className="mt-5">
            <Button
              variant="primary"
              onClick={() => setActiveNav('connection')}
              className="w-full flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Go to Connection & Reset
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Not Connected state
  if (!isLoadingSessions && (primarySession?.status === 'idle' || primarySession?.status === 'logged_out' || !primarySession)) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-app">
        <div className="max-w-md w-full bg-surface border border-border-subtle rounded-card p-6 shadow-card text-center">
          <div className="w-12 h-12 rounded-full bg-accent-soft border border-accent/20 text-accent flex items-center justify-center mx-auto mb-4">
            <QrCode className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-text-main tracking-tight">
            WhatsApp Not Connected
          </h3>
          <p className="text-sm text-text-muted mt-2 leading-relaxed">
            Link your phone to read messages and sync your WhatsApp chats directly to your dashboard.
          </p>
          <div className="mt-5">
            <Button
              variant="primary"
              onClick={() => setActiveNav('connection')}
              className="w-full flex items-center justify-center gap-2"
            >
              <QrCode className="w-4 h-4" />
              Go to Connection & Scan QR
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex w-full h-full overflow-hidden bg-app">
      {/* Column 1: Chat List (~360px) */}
      <section
        className={cn(
          'w-full md:w-[360px] md:shrink-0 flex flex-col bg-surface border-r border-border-subtle h-full select-none',
          mobileView === 'chat' ? 'hidden md:flex' : 'flex',
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-semibold text-text-main tracking-tight">Chats</h2>
            {isSocketConnected ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-accent-soft text-accent border border-accent/20">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-spin" />
                Reconnecting
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsShortcutsOpen(true)}
              title="Keyboard Shortcuts (?)"
              aria-label="Keyboard Shortcuts"
              className="p-2 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors"
            >
              <HelpCircle className="w-4 h-4 stroke-[1.75]" />
            </button>
            <button
              onClick={() => setIsStarredModalOpen(true)}
              title="Starred Messages"
              aria-label="Starred Messages"
              className="p-2 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors"
            >
              <Star className="w-4 h-4 stroke-[1.75]" />
            </button>
            <button
              onClick={() => refetchChats()}
              title="Refresh chats"
              aria-label="Refresh chats"
              className="p-2 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors"
            >
              <RefreshCw className="w-4 h-4 stroke-[1.75]" />
            </button>
          </div>
        </div>

        {/* Dedicated Archived Header when filter === 'archived' */}
        {filter === 'archived' && (
          <div className="px-4 py-2 bg-surface-subtle border-b border-border-subtle flex items-center justify-between animate-in fade-in duration-fast">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilter('all')}
                className="p-1 rounded-control text-text-muted hover:text-text-main hover:bg-surface transition-colors"
                title="Back to All Chats"
                aria-label="Back to All Chats"
              >
                <ChevronLeft className="w-4 h-4 stroke-[2]" />
              </button>
              <div className="flex items-center gap-1.5">
                <Archive className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs font-semibold text-text-main">Archived Chats</span>
              </div>
            </div>
            <span className="text-[11px] text-text-muted font-medium">
              {filterCounts.archived} {filterCounts.archived === 1 ? 'chat' : 'chats'}
            </span>
          </div>
        )}

        {/* Account Switcher */}
        {sessionData?.sessions && sessionData.sessions.length > 1 && (
          <div className="px-4 py-2 border-b border-border-subtle bg-surface-subtle/40 flex items-center justify-between gap-2 text-xs">
            <span className="text-[11px] font-semibold text-text-muted shrink-0">Account:</span>
            <select
              value={currentSessionId || ''}
              onChange={(e) => {
                setActiveSessionId(e.target.value);
                setSelectedChatJid(null);
              }}
              className="w-full bg-surface border border-border-subtle rounded-control px-2 py-1 text-xs text-text-main font-medium focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
            >
              {sessionData.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.phoneNumber ? `(+${s.phoneNumber})` : `[${s.status}]`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sync Progress Banner */}
        {syncProgress && syncProgress.processed > 0 && (
          <div className="bg-accent-soft border-b border-accent/20 px-4 py-2 flex items-center justify-between text-xs text-accent">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span className="font-medium">
                Syncing messages... {syncProgress.processed}
                {syncProgress.total ? ` of ${syncProgress.total}` : ''}
              </span>
            </div>
          </div>
        )}

        {/* Search Bar & Filter Tabs */}
        <div className="px-4 py-2.5 border-b border-border-subtle/50">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-text-muted absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or filter chats"
              className="w-full bg-surface-subtle text-text-main placeholder:text-text-muted text-xs rounded-control pl-9 pr-8 py-2 outline-none border border-transparent focus:border-accent focus:bg-surface transition-all duration-fast"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 text-text-muted hover:text-text-main p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Tabs (All / Unread / Groups / Archived) */}
          <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setFilter('all')}
              className={cn(
                'px-2.5 py-1 text-xs rounded-full font-medium transition-colors shrink-0 flex items-center gap-1.5',
                filter === 'all'
                  ? 'bg-accent-soft text-accent border border-accent/20'
                  : 'text-text-secondary hover:bg-surface-subtle',
              )}
            >
              <span>All</span>
            </button>

            <button
              onClick={() => setFilter('unread')}
              className={cn(
                'px-2.5 py-1 text-xs rounded-full font-medium transition-colors shrink-0 flex items-center gap-1.5',
                filter === 'unread'
                  ? 'bg-accent-soft text-accent border border-accent/20'
                  : 'text-text-secondary hover:bg-surface-subtle',
              )}
            >
              <span>Unread</span>
              {filterCounts.unread > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-accent text-white">
                  {filterCounts.unread}
                </span>
              )}
            </button>

            <button
              onClick={() => setFilter('groups')}
              className={cn(
                'px-2.5 py-1 text-xs rounded-full font-medium transition-colors shrink-0 flex items-center gap-1.5',
                filter === 'groups'
                  ? 'bg-accent-soft text-accent border border-accent/20'
                  : 'text-text-secondary hover:bg-surface-subtle',
              )}
            >
              <span>Groups</span>
              {filterCounts.groups > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-surface-subtle text-text-muted border border-border-subtle">
                  {filterCounts.groups}
                </span>
              )}
            </button>

            <button
              onClick={() => setFilter('archived')}
              className={cn(
                'px-2.5 py-1 text-xs rounded-full font-medium transition-colors shrink-0 flex items-center gap-1.5',
                filter === 'archived'
                  ? 'bg-accent-soft text-accent border border-accent/20'
                  : 'text-text-secondary hover:bg-surface-subtle',
              )}
            >
              <span>Archived</span>
              {filterCounts.archived > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-surface-subtle text-text-muted border border-border-subtle">
                  {filterCounts.archived}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Chat List Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/40">
          {isLoadingChats ? (
            <div className="p-8 flex items-center justify-center">
              <Spinner size="md" />
            </div>
          ) : chats.length > 0 ? (
            chats.map((chat) => {
              const isSelected = selectedChatJid === chat.jid;
              return (
                <div
                  key={chat.jid}
                  onClick={() => handleSelectChat(chat)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({
                      chat,
                      position: { x: e.clientX, y: e.clientY },
                    });
                  }}
                  className={cn(
                    'group relative flex items-center gap-3 cursor-pointer transition-colors duration-fast',
                    density === 'compact' ? 'px-3 py-2' : 'px-4 py-3',
                    isSelected
                      ? 'bg-surface-subtle'
                      : 'hover:bg-surface-subtle/60 active:bg-surface-subtle',
                  )}
                >
                  <Avatar
                    name={chat.displayName}
                    src={chat.profilePictureUrl || undefined}
                    isGroup={chat.type === 'group'}
                    size={density === 'compact' ? 'sm' : 'md'}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span
                        className={cn(
                          'font-medium text-text-main truncate',
                          density === 'compact' ? 'text-xs' : 'text-sm',
                        )}
                      >
                        {chat.displayName}
                      </span>
                      <span className="text-[11px] text-text-muted shrink-0 ml-1">
                        {formatChatTimestamp(chat.lastMessageAt || chat.updatedAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {typingMap?.[chat.jid] ? (
                        <p className="text-xs text-accent font-medium truncate leading-relaxed animate-pulse">
                          {typingMap[chat.jid] === 'recording' ? 'recording voice...' : 'typing...'}
                        </p>
                      ) : (
                        <p className="text-xs text-text-muted truncate leading-relaxed">
                          {chat.lastMessageText || 'No messages yet'}
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Pinned Icon */}
                        {chat.isPinned && (
                          <Pin className="w-3 h-3 text-text-muted fill-text-muted/30" />
                        )}

                        {/* Muted Icon */}
                        {chat.isMuted && <VolumeX className="w-3 h-3 text-text-muted" />}

                        {/* AI Auto-Reply Active Badge */}
                        {chat.aiEnabled && (
                          <span
                            className="px-1 py-0.2 rounded text-[9px] font-bold bg-accent-soft text-accent border border-accent/20"
                            title="AI Auto-Reply is active for this chat"
                          >
                            AI
                          </span>
                        )}

                        {/* Unread Counter or Marked Unread Dot */}
                        {chat.unreadCount > 0 ? (
                          <span
                            className={cn(
                              'w-4 h-4 rounded-full text-white text-[10px] font-semibold flex items-center justify-center',
                              chat.isMuted ? 'bg-text-muted' : 'bg-accent',
                            )}
                          >
                            {chat.unreadCount}
                          </span>
                        ) : chat.markedUnread ? (
                          <span
                            className="w-2.5 h-2.5 rounded-full bg-accent"
                            title="Marked as unread (local)"
                          />
                        ) : null}

                        {/* 3-dot trigger on hover */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextMenu({
                              chat,
                              position: { x: e.clientX, y: e.clientY },
                            });
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-muted hover:text-text-main hover:bg-surface transition-opacity"
                          title="Chat options"
                          aria-label="Chat options"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-text-muted">
              {search
                ? 'No matching chats found.'
                : filter === 'archived'
                ? 'No archived chats.'
                : 'No synced conversations yet.'}
            </div>
          )}
        </div>
      </section>

      {/* Column 2: Chat Conversation Window */}
      <section
        className={cn(
          'flex-1 flex flex-col h-full overflow-hidden relative',
          chatWallpaper === 'soft'
            ? 'bg-emerald-500/5 dark:bg-emerald-950/15'
            : chatWallpaper === 'subtle'
            ? 'bg-app bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-surface-subtle/50 via-app to-app'
            : 'bg-app',
          mobileView === 'list' ? 'hidden md:flex' : 'flex',
        )}
      >
        {selectedChat ? (
          <>
            {/* Chat Top Header */}
            <div className="h-16 px-4 bg-surface border-b border-border-subtle flex items-center justify-between shrink-0 shadow-subtle z-10">
              <div
                className="flex items-center gap-3 min-w-0 cursor-pointer"
                onClick={() => setShowRightPanel(!showRightPanel)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMobileView('list');
                  }}
                  className="md:hidden p-1.5 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle"
                >
                  <ChevronLeft className="w-5 h-5 stroke-[1.75]" />
                </button>

                <Avatar
                  name={selectedChat.displayName}
                  src={selectedChat.profilePictureUrl || undefined}
                  isGroup={selectedChat.type === 'group'}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-text-main tracking-tight leading-tight truncate">
                      {selectedChat.displayName}
                    </h3>
                    {selectedChat.type === 'group' && groupDetails?.group.announceOnly && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-subtle text-text-muted border border-border-subtle shrink-0">
                        <Lock className="w-2.5 h-2.5" />
                        Admin only
                      </span>
                    )}
                  </div>
                  {activePresence ? (
                    <p className="text-[11px] text-accent font-medium leading-tight animate-pulse">
                      {activePresence}
                    </p>
                  ) : (
                    <p className="text-[11px] text-text-muted leading-tight truncate">
                      {selectedChat.type === 'group'
                        ? groupDetails
                          ? `${groupDetails.participants.length} participants`
                          : 'Group conversation'
                        : selectedChat.phoneNumber
                          ? `+${selectedChat.phoneNumber}`
                          : selectedChat.jid}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-text-muted">
                {/* AI Auto-Reply Toggle Button (Private 1-on-1 chats only) */}
                {selectedChat.type !== 'group' && (
                  <button
                    type="button"
                    onClick={() => handleToggleChatAi(selectedChat)}
                    title={
                      selectedChat.aiEnabled
                        ? 'AI Auto-Reply is ON (Replies after ~10s human reading delay). Click to turn OFF.'
                        : 'AI Auto-Reply is OFF. Click to turn ON for this chat.'
                    }
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-fast border cursor-pointer',
                      selectedChat.aiEnabled
                        ? 'bg-accent text-white border-accent shadow-subtle hover:bg-accent-hover'
                        : 'bg-surface-subtle text-text-muted border-border-subtle hover:text-text-main hover:bg-surface',
                    )}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold">
                      {selectedChat.aiEnabled ? 'AI: ON' : 'AI: OFF'}
                    </span>
                  </button>
                )}

                <button
                  aria-label="Starred Messages"
                  title="Starred Messages"
                  onClick={() => setIsStarredModalOpen(true)}
                  className="p-2 rounded-control hover:text-text-main hover:bg-surface-subtle transition-colors"
                >
                  <Star className="w-5 h-5 stroke-[1.75]" />
                </button>
                <button
                  aria-label="Chat Info Panel"
                  onClick={() => setShowRightPanel(!showRightPanel)}
                  className={cn(
                    'p-2 rounded-control hover:text-text-main hover:bg-surface-subtle transition-colors',
                    showRightPanel && 'bg-surface-subtle text-accent',
                  )}
                >
                  <Info className="w-5 h-5 stroke-[1.75]" />
                </button>
              </div>
            </div>

            {/* Rate Limit Banner */}
            {rateLimitData?.isLimited && (
              <div className="bg-warning-soft border-b border-warning/20 px-4 py-2 flex items-center justify-between text-xs text-warning animate-in fade-in duration-fast">
                <span className="font-medium">
                  Waiting (rate limit) - {rateLimitData.resetInSeconds || 5}s remaining. Messages are safely queued.
                </span>
              </div>
            )}

            {/* Reconnecting Status Banner */}
            {primarySession?.status === 'reconnecting' && (
              <div className="bg-surface-subtle border-b border-border-subtle px-4 py-2 flex items-center gap-2 text-xs text-text-muted">
                <Spinner size="sm" />
                <span>Reconnecting to WhatsApp... Messages will send automatically when online.</span>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col gap-2"
            >
              {/* Spinner while loading older messages at top */}
              {isFetchingNextPage && (
                <div className="flex justify-center py-2">
                  <Spinner size="sm" />
                </div>
              )}

              {isLoadingMessages ? (
                <div className="flex-1 flex items-center justify-center">
                  <Spinner size="md" />
                </div>
              ) : allMessages.length > 0 ? (
                groupedMessages.map((group) => (
                  <React.Fragment key={group.dateLabel}>
                    {/* Date Separator Pill */}
                    <div className="flex justify-center my-2 select-none">
                      <span className="text-[11px] font-medium text-text-muted px-2.5 py-0.5 rounded-full bg-surface border border-border-subtle shadow-subtle">
                        {group.dateLabel}
                      </span>
                    </div>

                    {group.messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        isGroup={selectedChat.type === 'group'}
                        currentUserJid={primarySession?.phoneNumber || null}
                        quotedMessage={
                          msg.replyToMessageId
                            ? allMessages.find((m) => m.id === msg.replyToMessageId) || null
                            : null
                        }
                        onReply={(m) => {
                          setEditingMessage(null);
                          setReplyingTo(m);
                        }}
                        onOpenLightbox={(src, type, fn, cap) =>
                          setLightboxMedia({ src, type, fileName: fn, caption: cap })
                        }
                        onDownloadMedia={(messageId) => {
                          if (currentSessionId && selectedChatJid) {
                            api.downloadMedia(currentSessionId, selectedChatJid, messageId).catch(console.error);
                          }
                        }}
                        onRetrySend={handleRetrySend}
                        onReact={handleReact}
                        onCopy={handleCopy}
                        onForward={handleForward}
                        onStar={handleStar}
                        onEdit={handleEdit}
                        onDeleteForMe={handleDeleteForMe}
                        onDeleteForEveryone={handleDeleteForEveryone}
                      />
                    ))}
                  </React.Fragment>
                ))
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-text-muted text-center p-6">
                  No messages found in this chat yet.
                </div>
              )}
            </div>

            {/* Floating "New messages" indicator */}
            {hasNewMessages && (
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 animate-in fade-in zoom-in-95 duration-200">
                <button
                  onClick={() => scrollToBottom(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-surface text-accent font-medium text-xs rounded-full shadow-card border border-border-subtle hover:bg-surface-subtle transition-all cursor-pointer"
                >
                  <span>New messages</span>
                  <ArrowDown className="w-3.5 h-3.5 stroke-[2]" />
                </button>
              </div>
            )}

            {/* Floating Jump to Bottom Button */}
            {showScrollBottom && !hasNewMessages && (
              <button
                onClick={() => scrollToBottom(true)}
                className="absolute right-6 bottom-20 z-20 w-9 h-9 rounded-full bg-surface border border-border-subtle text-text-main shadow-card flex items-center justify-center hover:bg-surface-subtle transition-all duration-fast"
                aria-label="Scroll to bottom"
              >
                <ArrowDown className="w-4 h-4 text-accent" />
              </button>
            )}

            {/* Message Input */}
            <MessageInput
              sessionId={currentSessionId || ''}
              chatJid={selectedChat.jid}
              isGroup={selectedChat.type === 'group'}
              replyingTo={replyingTo}
              editingMessage={editingMessage}
              onCancelReply={() => setReplyingTo(null)}
              onCancelEdit={() => setEditingMessage(null)}
              onSaveEdit={handleSaveEdit}
              onTriggerEditLastMessage={handleTriggerEditLastMessage}
              onMessageSent={() => scrollToBottom(false)}
            />
          </>
        ) : (
          <EmptyState
            icon={<MessageSquare className="w-6 h-6" />}
            title="No conversation selected"
            description="Select a chat from the left panel to read message history."
          />
        )}
      </section>

      {/* Column 3: Contact & Group Info Panel */}
      {showRightPanel && selectedChat && currentSessionId && (
        <ChatInfoPanel
          sessionId={currentSessionId}
          chat={selectedChat}
          onClose={() => setShowRightPanel(false)}
          onOpenLightbox={(src, type, fn, cap) =>
            setLightboxMedia({ src, type, fileName: fn, caption: cap })
          }
          onJumpToMessage={(messageId) => {
            handleJumpToStarredChat(selectedChat.jid, messageId);
          }}
        />
      )}

      {/* Media Lightbox Viewer Modal */}
      {lightboxMedia && (
        <MediaLightbox
          isOpen={!!lightboxMedia}
          onClose={() => setLightboxMedia(null)}
          src={lightboxMedia.src}
          type={lightboxMedia.type}
          fileName={lightboxMedia.fileName}
          caption={lightboxMedia.caption}
        />
      )}

      {/* Forward Dialog Modal */}
      {forwardingMessage && currentSessionId && (
        <ForwardDialog
          isOpen={!!forwardingMessage}
          onClose={() => setForwardingMessage(null)}
          message={forwardingMessage}
          sessionId={currentSessionId}
          onForward={handleConfirmForward}
          isForwarding={isForwarding}
        />
      )}

      {/* Starred Messages Modal */}
      {isStarredModalOpen && currentSessionId && (
        <StarredMessagesModal
          isOpen={isStarredModalOpen}
          onClose={() => setIsStarredModalOpen(false)}
          sessionId={currentSessionId}
          onJumpToChat={handleJumpToStarredChat}
        />
      )}

      {/* Chat Row Right-Click / 3-dot Context Menu */}
      {contextMenu && (
        <ChatContextMenu
          chat={contextMenu.chat}
          isOpen={!!contextMenu}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onPin={handlePinChat}
          onArchive={handleArchiveChat}
          onMute={handleMuteChat}
          onMarkUnread={handleMarkUnread}
          onToggleAi={handleToggleChatAi}
        />
      )}

      {/* Keyboard Shortcuts Cheat Sheet Modal */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
};