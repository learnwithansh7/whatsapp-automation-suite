import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Users,
  Shield,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Search,
  Lock,
  Calendar,
  Pin,
  Archive,
  Volume2,
  VolumeX,
  Mail,
  Copy,
  Check,
  Download,
  ExternalLink,
  Star,
  Quote,
  BadgeCheck,
  Bot,
} from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { Input } from '../ui/Input';
import { Switch } from '../ui/Switch';
import { api, type ChatItem } from '../../lib/api';
import { formatChatTimestamp, formatFileSize, formatMessageTime } from '../../lib/formatters';
import { useToastStore } from '../../store/useToastStore';
import { cn } from '../../lib/utils';

interface ChatInfoPanelProps {
  sessionId: string;
  chat: ChatItem;
  onClose: () => void;
  onOpenLightbox?: (src: string, type: 'image' | 'video', fileName?: string, caption?: string | null) => void;
  onJumpToMessage?: (messageId: string) => void;
}

export const ChatInfoPanel: React.FC<ChatInfoPanelProps> = ({
  sessionId,
  chat,
  onClose,
  onOpenLightbox,
  onJumpToMessage,
}) => {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const isGroup = chat.type === 'group';

  const [participantSearch, setParticipantSearch] = useState('');
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [sharedTab, setSharedTab] = useState<'media' | 'docs' | 'links' | 'starred'>('media');

  // Contact / Group Details Query
  const { data: groupData, isLoading: isGroupLoading } = useQuery({
    queryKey: ['groupDetails', sessionId, chat.jid],
    queryFn: () => api.getGroupDetails(sessionId, chat.jid),
    enabled: isGroup && !!sessionId && !!chat.jid,
  });

  const { data: contactData, isLoading: isContactLoading } = useQuery({
    queryKey: ['chatDetails', sessionId, chat.jid],
    queryFn: () => api.getChatDetails(sessionId, chat.jid),
    enabled: !isGroup && !!sessionId && !!chat.jid,
  });

  // Shared Media Query for active subtab
  const {
    data: sharedData,
    isLoading: isSharedLoading,
  } = useQuery({
    queryKey: ['sharedMedia', sessionId, chat.jid, sharedTab],
    queryFn: () => api.getSharedMedia(sessionId, chat.jid, { type: sharedTab, limit: 30 }),
    enabled: !!sessionId && !!chat.jid,
  });

  const isLoading = isGroup ? isGroupLoading : isContactLoading;

  // Pin Mutation
  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) => api.pinChat(sessionId, chat.jid, pinned),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['chats', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['chatDetails', sessionId, chat.jid] });
      addToast({
        title: res.chat.isPinned ? 'Chat Pinned' : 'Chat Unpinned',
        message: res.chat.isPinned ? 'Chat pinned to top' : 'Chat unpinned',
        type: 'success',
      });
    },
    onError: (err: any) => {
      addToast({
        title: 'Pin Failed',
        message: err?.response?.data?.error || 'Failed to pin chat (maximum 3 allowed)',
        type: 'error',
      });
    },
  });

  // Archive Mutation
  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) => api.archiveChat(sessionId, chat.jid, archived),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['chats', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['chatDetails', sessionId, chat.jid] });
      addToast({
        title: res.chat.isArchived ? 'Chat Archived' : 'Chat Unarchived',
        message: res.chat.isArchived ? 'Chat moved to Archived' : 'Chat unarchived',
        type: 'success',
      });
    },
  });

  // Mute Mutation
  const muteMutation = useMutation({
    mutationFn: (duration: '8h' | '1w' | 'always' | null) => api.muteChat(sessionId, chat.jid, duration),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['chats', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['chatDetails', sessionId, chat.jid] });
      addToast({
        title: res.chat.isMuted ? 'Chat Muted' : 'Chat Unmuted',
        message: res.chat.isMuted ? 'Notifications muted' : 'Notifications restored',
        type: 'success',
      });
    },
  });

  // Mark Unread Mutation
  const unreadMutation = useMutation({
    mutationFn: (unread: boolean) => api.markChatUnread(sessionId, chat.jid, unread),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['chats', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['chatDetails', sessionId, chat.jid] });
      addToast({
        title: res.chat.markedUnread ? 'Marked as Unread' : 'Marked as Read',
        message: 'Chat status updated (Local only)',
        type: 'info',
      });
    },
  });

  // AI Auto-Reply Toggle Mutation
  const aiToggleMutation = useMutation({
    mutationFn: (enabled: boolean) => api.toggleChatAi(sessionId, chat.jid, enabled),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['chats', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['chatDetails', sessionId, chat.jid] });
      addToast({
        title: res.aiEnabled ? 'AI Auto-Reply Enabled' : 'AI Auto-Reply Disabled',
        message: res.aiEnabled
          ? 'AI will respond to incoming messages after a 10s human reading delay.'
          : 'AI auto-reply disabled for this chat.',
        type: 'info',
      });
    },
    onError: () => {
      addToast({
        title: 'Error',
        message: 'Failed to update AI auto-reply setting.',
        type: 'error',
      });
    },
  });

  const handleCopyPhone = (phone: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`+${phone}`).catch(console.error);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const participants = isGroup
    ? (groupData?.participants || []).filter((p) => {
        if (!participantSearch.trim()) return true;
        const q = participantSearch.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.jid.toLowerCase().includes(q) ||
          (p.phoneNumber && p.phoneNumber.includes(q))
        );
      })
    : [];

  const aboutText = contactData?.chat?.aboutText;
  const verifiedName = contactData?.chat?.verifiedName;

  return (
    <aside className="w-full lg:w-[340px] shrink-0 bg-surface border-l border-border-subtle flex flex-col h-full overflow-hidden select-none">
      {/* Header */}
      <div className="h-16 px-4 border-b border-border-subtle flex items-center justify-between shrink-0 shadow-subtle">
        <h3 className="text-sm font-semibold text-text-main">
          {isGroup ? 'Group Info' : 'Contact Info'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close info panel"
          className="p-1.5 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors cursor-pointer"
        >
          <X className="w-5 h-5 stroke-[1.75]" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <Spinner size="md" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Main Avatar & Profile Section */}
          <div className="flex flex-col items-center text-center pb-4 border-b border-border-subtle">
            <div
              className="cursor-pointer group relative"
              onClick={() => {
                const img = groupData?.group.pictureUrl || chat.profilePictureUrl;
                if (img && onOpenLightbox) {
                  onOpenLightbox(img, 'image', 'profile.jpg', chat.displayName);
                }
              }}
            >
              <Avatar
                name={groupData?.group.subject || chat.displayName}
                src={groupData?.group.pictureUrl || chat.profilePictureUrl || undefined}
                isGroup={isGroup}
                size="xl"
                className="mb-3 ring-2 ring-border-subtle group-hover:ring-accent transition-all duration-fast"
              />
            </div>

            <div className="flex items-center gap-1.5 justify-center">
              <h4 className="text-base font-semibold text-text-main tracking-tight break-all">
                {groupData?.group.subject || chat.displayName}
              </h4>
              {verifiedName && (
                <span title="Verified Business" className="text-accent">
                  <BadgeCheck className="w-4 h-4 fill-accent text-white inline shrink-0" />
                </span>
              )}
            </div>

            {/* Phone Number with Copy */}
            {chat.phoneNumber ? (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                <span>+{chat.phoneNumber}</span>
                <button
                  type="button"
                  onClick={() => handleCopyPhone(chat.phoneNumber!)}
                  title="Copy phone number"
                  className="p-1 rounded text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors cursor-pointer"
                >
                  {copiedPhone ? <Check className="w-3 h-3 text-accent" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-text-muted mt-0.5 break-all">{chat.jid}</p>
            )}

            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap justify-center">
              <Badge variant="default" dot>
                {isGroup ? 'Group Conversation' : 'WhatsApp Contact'}
              </Badge>
              {groupData?.group.announceOnly && (
                <Badge variant="warning" className="flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Admin-only
                </Badge>
              )}
            </div>
          </div>

          {/* Quick Action Buttons Row (Pin, Archive, Mute, Mark Unread) */}
          <div className="grid grid-cols-4 gap-1.5 pb-4 border-b border-border-subtle">
            {/* Pin */}
            <button
              type="button"
              onClick={() => pinMutation.mutate(!chat.isPinned)}
              className={cn(
                'p-2 rounded-control flex flex-col items-center justify-center gap-1 text-center transition-colors cursor-pointer border',
                chat.isPinned
                  ? 'bg-accent-soft text-accent border-accent/20'
                  : 'bg-surface-subtle text-text-muted hover:text-text-main border-border-subtle',
              )}
              title={chat.isPinned ? 'Unpin chat' : 'Pin chat (max 3)'}
            >
              <Pin className={cn('w-4 h-4', chat.isPinned && 'fill-accent')} />
              <span className="text-[10px] font-medium">{chat.isPinned ? 'Pinned' : 'Pin'}</span>
            </button>

            {/* Archive */}
            <button
              type="button"
              onClick={() => archiveMutation.mutate(!chat.isArchived)}
              className={cn(
                'p-2 rounded-control flex flex-col items-center justify-center gap-1 text-center transition-colors cursor-pointer border',
                chat.isArchived
                  ? 'bg-accent-soft text-accent border-accent/20'
                  : 'bg-surface-subtle text-text-muted hover:text-text-main border-border-subtle',
              )}
              title={chat.isArchived ? 'Unarchive chat' : 'Archive chat'}
            >
              <Archive className="w-4 h-4" />
              <span className="text-[10px] font-medium">{chat.isArchived ? 'Archived' : 'Archive'}</span>
            </button>

            {/* Mute */}
            <button
              type="button"
              onClick={() => muteMutation.mutate(chat.isMuted ? null : 'always')}
              className={cn(
                'p-2 rounded-control flex flex-col items-center justify-center gap-1 text-center transition-colors cursor-pointer border',
                chat.isMuted
                  ? 'bg-accent-soft text-accent border-accent/20'
                  : 'bg-surface-subtle text-text-muted hover:text-text-main border-border-subtle',
              )}
              title={chat.isMuted ? 'Unmute notifications' : 'Mute notifications'}
            >
              {chat.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span className="text-[10px] font-medium">{chat.isMuted ? 'Muted' : 'Mute'}</span>
            </button>

            {/* Mark Unread */}
            <button
              type="button"
              onClick={() => unreadMutation.mutate(!chat.markedUnread && chat.unreadCount === 0)}
              className={cn(
                'p-2 rounded-control flex flex-col items-center justify-center gap-1 text-center transition-colors cursor-pointer border',
                chat.markedUnread || chat.unreadCount > 0
                  ? 'bg-accent-soft text-accent border-accent/20'
                  : 'bg-surface-subtle text-text-muted hover:text-text-main border-border-subtle',
              )}
              title="Mark as unread (Local only)"
            >
              <Mail className="w-4 h-4" />
              <span className="text-[10px] font-medium truncate w-full text-center">
                {chat.markedUnread || chat.unreadCount > 0 ? 'Read' : 'Unread'}
              </span>
            </button>
          </div>

          {/* AI Auto-Reply Switch (1-on-1 private contacts only) */}
          {!isGroup && (
            <div className="p-3 rounded-control bg-surface-subtle border border-border-subtle flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors',
                    chat.aiEnabled
                      ? 'bg-accent text-white shadow-subtle'
                      : 'bg-surface border border-border-subtle text-text-muted',
                  )}
                >
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-text-main">AI Auto-Reply</p>
                    <span
                      className={cn(
                        'px-1 py-0.2 rounded text-[9px] font-bold border',
                        chat.aiEnabled
                          ? 'bg-accent-soft text-accent border-accent/20'
                          : 'bg-surface text-text-muted border-border-subtle',
                      )}
                    >
                      {chat.aiEnabled ? 'ACTIVE' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Replies after 10s reading delay
                  </p>
                </div>
              </div>
              <Switch
                checked={!!chat.aiEnabled}
                onChange={(val) => aiToggleMutation.mutate(val)}
              />
            </div>
          )}

          {/* Contact View: About status quote box */}
          {!isGroup && (
            <div className="pb-4 border-b border-border-subtle flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                <Quote className="w-3 h-3 text-accent" />
                About
              </span>
              <div className="p-2.5 rounded-control bg-surface-subtle/80 border border-border-subtle text-xs text-text-main italic leading-relaxed">
                {aboutText ? `"${aboutText}"` : 'About is hidden or unavailable'}
              </div>
            </div>
          )}

          {/* Group View: Description & Creation Date */}
          {isGroup && groupData?.group.description && (
            <div className="pb-4 border-b border-border-subtle flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                Description
              </span>
              <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                {groupData.group.description}
              </p>
            </div>
          )}

          {isGroup && groupData?.group.groupCreatedAt && (
            <div className="flex items-center gap-2 text-xs text-text-muted pb-4 border-b border-border-subtle">
              <Calendar className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>Created {formatChatTimestamp(groupData.group.groupCreatedAt)}</span>
            </div>
          )}

          {/* Group Participants */}
          {isGroup && (
            <div className="pb-4 border-b border-border-subtle flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Participants ({groupData?.participants?.length || 0})
                </span>
              </div>

              <div className="relative">
                <Input
                  placeholder="Search participants..."
                  value={participantSearch}
                  onChange={(e) => setParticipantSearch(e.target.value)}
                  leftIcon={<Search className="w-3.5 h-3.5 text-text-muted" />}
                  className="h-8 text-xs"
                />
              </div>

              <div className="flex flex-col divide-y divide-border-subtle/50 max-h-52 overflow-y-auto">
                {participants.length > 0 ? (
                  participants.map((p) => {
                    const isAdmin = p.role === 'admin' || p.role === 'superadmin';
                    return (
                      <div key={p.jid} className="py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={p.name} src={p.profilePictureUrl || undefined} size="sm" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-text-main truncate">{p.name}</p>
                            <p className="text-[10px] text-text-muted truncate">
                              {p.phoneNumber ? `+${p.phoneNumber}` : p.jid.split('@')[0]}
                            </p>
                          </div>
                        </div>
                        {isAdmin && (
                          <span className="text-[10px] font-medium text-accent bg-accent-soft px-1.5 py-0.5 rounded border border-accent/20 flex items-center gap-1 shrink-0">
                            <Shield className="w-2.5 h-2.5" />
                            {p.role === 'superadmin' ? 'Owner' : 'Admin'}
                          </span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-text-muted py-3 text-center">
                    {participantSearch ? 'No matching participants' : 'No participants found'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Shared Media Tabs (Media, Docs, Links, Starred) */}
          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              Shared Content
            </span>

            {/* Subtabs switcher */}
            <div className="flex items-center gap-1 p-1 bg-surface-subtle rounded-control border border-border-subtle text-xs">
              <button
                type="button"
                onClick={() => setSharedTab('media')}
                className={cn(
                  'flex-1 py-1 rounded text-center font-medium transition-colors cursor-pointer',
                  sharedTab === 'media'
                    ? 'bg-surface text-accent shadow-subtle border border-border-subtle/50'
                    : 'text-text-muted hover:text-text-main',
                )}
              >
                Media
              </button>
              <button
                type="button"
                onClick={() => setSharedTab('docs')}
                className={cn(
                  'flex-1 py-1 rounded text-center font-medium transition-colors cursor-pointer',
                  sharedTab === 'docs'
                    ? 'bg-surface text-accent shadow-subtle border border-border-subtle/50'
                    : 'text-text-muted hover:text-text-main',
                )}
              >
                Docs
              </button>
              <button
                type="button"
                onClick={() => setSharedTab('links')}
                className={cn(
                  'flex-1 py-1 rounded text-center font-medium transition-colors cursor-pointer',
                  sharedTab === 'links'
                    ? 'bg-surface text-accent shadow-subtle border border-border-subtle/50'
                    : 'text-text-muted hover:text-text-main',
                )}
              >
                Links
              </button>
              <button
                type="button"
                onClick={() => setSharedTab('starred')}
                className={cn(
                  'flex-1 py-1 rounded text-center font-medium transition-colors cursor-pointer',
                  sharedTab === 'starred'
                    ? 'bg-surface text-accent shadow-subtle border border-border-subtle/50'
                    : 'text-text-muted hover:text-text-main',
                )}
              >
                Starred
              </button>
            </div>

            {/* Subtab Content Area */}
            <div className="min-h-36">
              {isSharedLoading ? (
                <div className="p-8 flex items-center justify-center">
                  <Spinner size="sm" />
                </div>
              ) : sharedData?.items && sharedData.items.length > 0 ? (
                <>
                  {/* Media Grid */}
                  {sharedTab === 'media' && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {sharedData.items.map((item: any) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            if (item.mediaUrl && onOpenLightbox) {
                              onOpenLightbox(
                                item.mediaUrl,
                                item.type === 'video' ? 'video' : 'image',
                                item.mediaFileName,
                                item.caption,
                              );
                            }
                          }}
                          className="aspect-square bg-surface-subtle rounded-control border border-border-subtle overflow-hidden relative group cursor-pointer"
                        >
                          {item.type === 'image' && item.mediaUrl ? (
                            <img
                              src={item.mediaUrl}
                              alt={item.caption || 'Media'}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-fast"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-accent">
                              <ImageIcon className="w-5 h-5" />
                              <span className="text-[9px] mt-1 text-text-muted">{item.type}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Documents List */}
                  {sharedTab === 'docs' && (
                    <div className="flex flex-col divide-y divide-border-subtle/50">
                      {sharedData.items.map((doc: any) => (
                        <div key={doc.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded bg-surface-subtle border border-border-subtle flex items-center justify-center text-accent shrink-0">
                              <FileText className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-text-main truncate">{doc.name}</p>
                              <p className="text-[10px] text-text-muted">
                                {formatFileSize(doc.size)} • {formatMessageTime(doc.timestamp)}
                              </p>
                            </div>
                          </div>
                          {doc.downloadUrl && (
                            <a
                              href={doc.downloadUrl}
                              download={doc.name}
                              className="p-1 rounded text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors shrink-0"
                              title="Download document"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Links List */}
                  {sharedTab === 'links' && (
                    <div className="flex flex-col divide-y divide-border-subtle/50">
                      {sharedData.items.map((link: any) => (
                        <a
                          key={link.id}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-2.5 flex items-start gap-2.5 hover:bg-surface-subtle px-1 rounded transition-colors group cursor-pointer"
                        >
                          <div className="w-6 h-6 rounded bg-surface-subtle border border-border-subtle flex items-center justify-center text-accent shrink-0 mt-0.5">
                            <LinkIcon className="w-3 h-3" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-text-main line-clamp-1 group-hover:text-accent transition-colors">
                              {link.title || link.url}
                            </p>
                            {link.description && (
                              <p className="text-[10px] text-text-muted line-clamp-2 mt-0.5">
                                {link.description}
                              </p>
                            )}
                            <div className="flex items-center gap-1 text-[9px] text-text-muted mt-1">
                              <span className="truncate">{link.url}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Starred Messages List */}
                  {sharedTab === 'starred' && (
                    <div className="flex flex-col divide-y divide-border-subtle/50">
                      {sharedData.items.map((item: any) => (
                        <div
                          key={item.id}
                          onClick={() => onJumpToMessage && onJumpToMessage(item.id)}
                          className="py-2.5 flex items-start gap-2 hover:bg-surface-subtle px-1 rounded transition-colors cursor-pointer group"
                        >
                          <Star className="w-3.5 h-3.5 fill-warning text-warning shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-text-main line-clamp-2 leading-relaxed">
                              {item.text || item.caption || item.mediaFileName || 'Starred item'}
                            </p>
                            <span className="text-[10px] text-text-muted mt-1 block">
                              {formatChatTimestamp(item.timestamp)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="p-8 text-center text-xs text-text-muted flex flex-col items-center justify-center gap-1.5">
                  <p className="font-medium text-text-main">No {sharedTab} yet</p>
                  <p className="text-[11px]">Items shared in this conversation will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
