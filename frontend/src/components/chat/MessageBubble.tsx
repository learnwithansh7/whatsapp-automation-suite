import React from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  FileText,
  Play,
  Ban,
  MapPin,
  User as UserIcon,
  Download,
  CornerUpLeft,
  AlertCircle,
  Forward,
  Star,
  Edit2,
} from 'lucide-react';
import type { MessageItem } from '../../lib/api';
import { formatMessageTime, formatFileSize, getSenderColor } from '../../lib/formatters';
import { AudioPlayer } from './AudioPlayer';
import { Avatar } from '../ui/Avatar';
import { MessageActionsMenu } from './MessageActionsMenu';
import { LinkPreviewCard } from './LinkPreviewCard';
import { useUIStore } from '../../store/useUIStore';
import { cn } from '../../lib/utils';

interface MessageBubbleProps {
  message: MessageItem;
  isGroup?: boolean;
  currentUserJid?: string | null;
  quotedMessage?: MessageItem | null;
  onReply?: (message: MessageItem) => void;
  onOpenLightbox?: (src: string, type: 'image' | 'video', fileName?: string, caption?: string | null) => void;
  onDownloadMedia?: (messageId: string) => void;
  onRetrySend?: (message: MessageItem) => void;
  onReact?: (messageId: string, emoji: string | null) => void;
  onCopy?: (text: string) => void;
  onForward?: (message: MessageItem) => void;
  onStar?: (messageId: string, star: boolean) => void;
  onEdit?: (message: MessageItem) => void;
  onDeleteForMe?: (messageId: string) => void;
  onDeleteForEveryone?: (messageId: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isGroup = false,
  currentUserJid,
  quotedMessage,
  onReply,
  onOpenLightbox,
  onDownloadMedia,
  onRetrySend,
  onReact,
  onCopy,
  onForward,
  onStar,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
}) => {
  const {
    id,
    fromMe,
    type,
    text,
    caption,
    mediaFileName,
    mediaSize,
    timestamp,
    status,
    isDeleted,
    deletedForEveryone,
    mediaUrl,
    thumbnail,
    mediaDownloadStatus,
    durationSeconds,
    mediaMime,
    isForwarded,
    isStarred,
    editedAt,
    reactions = [],
  } = message;

  const formattedTime = formatMessageTime(timestamp);

  // 1. System notices in groups ("X added Y", "X left", "Subject changed")
  if (type === 'system') {
    return (
      <div className="flex w-full justify-center my-2 select-none">
        <div className="px-3.5 py-1.5 rounded-full bg-surface-subtle border border-border-subtle/80 text-text-muted text-[11px] font-medium max-w-[85%] text-center shadow-subtle">
          {text || 'System notice'}
        </div>
      </div>
    );
  }

  const antiRevokeEnabled = useUIStore((s) => s.antiRevokeEnabled);
  const isRevokedBySender = !fromMe && (isDeleted || deletedForEveryone) && antiRevokeEnabled;

  // 2. Deleted message placeholders (shown for own deleted messages, OR if anti-revoke is disabled)
  if ((isDeleted || deletedForEveryone) && !isRevokedBySender) {
    return (
      <div id={`msg-${id}`} className={cn('flex w-full mb-1.5', fromMe ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'max-w-[85%] md:max-w-[70%] px-3.5 py-2 rounded-card text-xs italic flex items-center gap-1.5 border shadow-subtle',
            fromMe
              ? 'bg-chat-bubble-out/60 text-text-muted border-border-subtle/50 rounded-tr-sm'
              : 'bg-chat-bubble-in text-text-muted border-border-subtle rounded-tl-sm',
          )}
        >
          <Ban className="w-3.5 h-3.5 shrink-0 opacity-70" />
          <span>{fromMe ? 'You deleted this message' : 'This message was deleted'}</span>
          <span className="text-[10px] ml-2 not-italic opacity-70">{formattedTime}</span>
        </div>
      </div>
    );
  }

  const renderStatus = () => {
    if (!fromMe) return null;
    switch (status) {
      case 'pending':
        return (
          <span title="Pending send">
            <Clock className="w-3.5 h-3.5 text-text-muted inline" />
          </span>
        );
      case 'sent':
        return (
          <span title="Sent to WhatsApp">
            <Check className="w-3.5 h-3.5 text-text-muted inline" />
          </span>
        );
      case 'delivered':
        return (
          <span title="Delivered to recipient">
            <CheckCheck className="w-3.5 h-3.5 text-text-muted inline" />
          </span>
        );
      case 'read':
        return (
          <span title="Read by recipient">
            <CheckCheck className="w-3.5 h-3.5 text-info inline" />
          </span>
        );
      case 'failed':
        return (
          <button
            type="button"
            onClick={() => onRetrySend && onRetrySend(message)}
            className="flex items-center gap-1 text-[10px] text-danger font-medium hover:underline cursor-pointer"
            title="Send failed - click to retry"
          >
            <AlertCircle className="w-3 h-3" />
            <span>Retry</span>
          </button>
        );
      default:
        return <CheckCheck className="w-3.5 h-3.5 text-text-muted inline" />;
    }
  };

  // Group incoming sender display
  const senderDisplayName =
    !fromMe && isGroup
      ? message.senderName || (message.senderJid ? message.senderJid.split('@')[0] : null)
      : null;

  const isVoiceNote = type === 'audio' && (mediaMime?.includes('ogg') || mediaMime?.includes('opus'));

  // Group reactions by emoji
  const reactionGroups = React.useMemo(() => {
    const map = new Map<string, { count: number; users: string[]; hasReacted: boolean }>();
    for (const r of reactions) {
      const existing = map.get(r.emoji) || { count: 0, users: [], hasReacted: false };
      existing.count += 1;
      existing.users.push(r.reactorJid);
      if (r.reactorJid === 'me' || (currentUserJid && r.reactorJid.includes(currentUserJid))) {
        existing.hasReacted = true;
      }
      map.set(r.emoji, existing);
    }
    return Array.from(map.entries());
  }, [reactions, currentUserJid]);

  // Mentions text renderer
  const renderMessageText = (rawContent: string) => {
    if (!rawContent) return null;
    const parts = rawContent.split(/(@\d{7,16})/g);
    return parts.map((part, i) => {
      if (part.startsWith('@') && part.length > 7) {
        return (
          <span
            key={i}
            className="font-semibold text-accent bg-accent-soft/40 px-1 py-0.5 rounded cursor-pointer hover:underline"
            title={part}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div id={`msg-${id}`} className={cn('group relative flex w-full mb-1.5 transition-colors duration-500 rounded-lg', fromMe ? 'justify-end' : 'justify-start')}>
      {/* Floating Action Menu & Quick Reply */}
      <div
        className={cn(
          'absolute top-2 flex items-center gap-1 z-20',
          fromMe ? '-left-14 flex-row-reverse' : '-right-14',
        )}
      >
        {onReply && (
          <button
            type="button"
            onClick={() => onReply(message)}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-fast p-1.5 rounded-full bg-surface border border-border-subtle text-text-muted hover:text-text-main shadow-subtle"
            title="Reply"
            aria-label="Reply"
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Message Actions Menu */}
        <MessageActionsMenu
          message={message}
          fromMe={fromMe}
          onReact={(emoji) => onReact && onReact(id, emoji)}
          onReply={() => onReply && onReply(message)}
          onCopy={() => onCopy && onCopy(text || caption || '')}
          onForward={() => onForward && onForward(message)}
          onStar={(star) => onStar && onStar(id, star)}
          onEdit={onEdit ? () => onEdit(message) : undefined}
          onDeleteForMe={() => onDeleteForMe && onDeleteForMe(id)}
          onDeleteForEveryone={onDeleteForEveryone ? () => onDeleteForEveryone(id) : undefined}
        />
      </div>

      <div
        className={cn(
          'relative max-w-[85%] md:max-w-[70%] p-3 rounded-card text-text-main shadow-card transition-all',
          fromMe
            ? 'bg-chat-bubble-out border border-border-subtle/40 rounded-tr-sm'
            : isRevokedBySender
              ? 'bg-rose-50/50 dark:bg-rose-950/20 border border-rose-300/60 dark:border-rose-900/40 rounded-tl-sm ring-1 ring-rose-400/20'
              : 'bg-chat-bubble-in border border-border-subtle rounded-tl-sm',
          status === 'failed' && 'border-danger/40 bg-danger-soft/20',
        )}
      >
        {/* Anti-Revoke Notice Header */}
        {isRevokedBySender && (
          <div className="flex items-center justify-between gap-2 px-2.5 py-1 mb-2 rounded bg-rose-100/70 dark:bg-rose-950/40 border border-rose-300/60 dark:border-rose-800/40 text-rose-700 dark:text-rose-300 text-[11px] font-medium select-none">
            <div className="flex items-center gap-1.5 min-w-0">
              <Ban className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
              <span className="font-semibold">Deleted by sender</span>
            </div>
            {message.deletedAt && (
              <span className="text-[10px] opacity-80 shrink-0 font-normal">
                {formatMessageTime(message.deletedAt)}
              </span>
            )}
          </div>
        )}
        {/* Forwarded Header */}
        {isForwarded && (
          <div className="flex items-center gap-1 text-[11px] text-text-muted italic mb-1.5 pb-1 border-b border-border-subtle/40">
            <Forward className="w-3 h-3 text-text-muted" />
            <span>Forwarded</span>
          </div>
        )}

        {/* Sender Name in Group Chat */}
        {senderDisplayName && (
          <div className="flex items-center gap-1.5 mb-1">
            <Avatar name={senderDisplayName} size="sm" />
            <span
              className={cn(
                'text-[11px] font-semibold tracking-tight',
                getSenderColor(message.senderJid),
              )}
            >
              ~{senderDisplayName}
            </span>
          </div>
        )}

        {/* Quoted Message Preview Box */}
        {quotedMessage && (
          <div className="mb-2 p-2 rounded-control bg-surface-subtle/80 border-l-4 border-accent text-xs">
            <span className="font-semibold text-accent text-[11px] block">
              {quotedMessage.fromMe ? 'You' : quotedMessage.senderName || 'Contact'}
            </span>
            <p className="text-text-muted truncate mt-0.5">
              {quotedMessage.text || quotedMessage.caption || quotedMessage.mediaFileName || 'Attachment'}
            </p>
          </div>
        )}

        {/* Media: Image */}
        {type === 'image' && (
          <div className="mb-1.5">
            {mediaUrl || thumbnail ? (
              <div
                onClick={() =>
                  mediaUrl &&
                  onOpenLightbox &&
                  onOpenLightbox(mediaUrl, 'image', mediaFileName || undefined, caption)
                }
                className="cursor-pointer overflow-hidden rounded-control border border-border-subtle max-h-72 bg-surface-subtle"
              >
                <img
                  src={mediaUrl || thumbnail || ''}
                  alt={caption || 'Photo'}
                  className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-fast"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="w-full min-h-[140px] bg-surface-subtle border border-border-subtle rounded-control flex flex-col items-center justify-center p-4 text-center">
                <Clock className="w-5 h-5 text-accent animate-spin mb-1" />
                <span className="text-xs text-text-muted">Downloading photo...</span>
              </div>
            )}
            {caption && (
              <>
                <p className="text-sm mt-2 leading-relaxed whitespace-pre-wrap">{renderMessageText(caption)}</p>
                <LinkPreviewCard text={caption} />
              </>
            )}
          </div>
        )}

        {/* Media: Video */}
        {type === 'video' && (
          <div className="mb-1.5">
            {mediaUrl ? (
              <div
                onClick={() =>
                  onOpenLightbox &&
                  onOpenLightbox(mediaUrl, 'video', mediaFileName || undefined, caption)
                }
                className="relative cursor-pointer overflow-hidden rounded-control border border-border-subtle max-h-72 bg-black flex items-center justify-center"
              >
                {thumbnail ? (
                  <img src={thumbnail} alt="Video thumbnail" className="w-full h-full object-cover" />
                ) : (
                  <video src={mediaUrl} className="w-full h-full object-cover" />
                )}
                <div className="absolute w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center shadow-card hover:scale-110 transition-transform">
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </div>
              </div>
            ) : mediaDownloadStatus === 'none' && onDownloadMedia ? (
              <button
                type="button"
                onClick={() => onDownloadMedia(id)}
                className="w-full min-h-[140px] bg-surface-subtle hover:bg-surface border border-border-subtle rounded-control flex flex-col items-center justify-center p-4 text-center transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-surface border border-border-subtle flex items-center justify-center text-accent mb-2">
                  <Download className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-text-main">Download Video</span>
                {mediaSize && (
                  <span className="text-[11px] text-text-muted mt-0.5">{formatFileSize(mediaSize)}</span>
                )}
              </button>
            ) : (
              <div className="w-full min-h-[140px] bg-surface-subtle border border-border-subtle rounded-control flex flex-col items-center justify-center p-4 text-center">
                <Clock className="w-5 h-5 text-accent animate-spin mb-1" />
                <span className="text-xs text-text-muted">Downloading video...</span>
              </div>
            )}
            {caption && (
              <>
                <p className="text-sm mt-2 leading-relaxed whitespace-pre-wrap">{renderMessageText(caption)}</p>
                <LinkPreviewCard text={caption} />
              </>
            )}
          </div>
        )}

        {/* Media: Audio & Voice Note */}
        {type === 'audio' && (
          <AudioPlayer
            src={mediaUrl}
            durationSeconds={durationSeconds}
            isVoice={Boolean(isVoiceNote)}
          />
        )}

        {/* Media: Document */}
        {type === 'document' && (
          <div className="flex items-center gap-3 p-2 bg-surface-subtle border border-border-subtle rounded-control mb-1">
            <div className="w-10 h-10 rounded-control bg-surface border border-border-subtle flex items-center justify-center text-accent shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-main truncate" title={mediaFileName || 'Document'}>
                {mediaFileName || 'Document'}
              </p>
              <p className="text-[10px] text-text-muted mt-0.5">
                {mediaSize ? formatFileSize(mediaSize) : 'Document'}
              </p>
            </div>
            {mediaUrl && (
              <a
                href={mediaUrl}
                download={mediaFileName || 'document'}
                className="p-1.5 rounded-control text-text-muted hover:text-text-main hover:bg-surface transition-colors shrink-0"
                title="Download document"
                aria-label="Download document"
              >
                <Download className="w-4 h-4" />
              </a>
            )}
          </div>
        )}

        {/* Media: Sticker */}
        {type === 'sticker' && (
          <div className="max-w-[140px] max-h-[140px] my-1">
            {mediaUrl ? (
              <img src={mediaUrl} alt="Sticker" className="w-full h-full object-contain" />
            ) : (
              <div className="w-24 h-24 bg-surface-subtle rounded-card flex items-center justify-center text-xs text-text-muted">
                Sticker
              </div>
            )}
          </div>
        )}

        {/* Location */}
        {type === 'location' && (
          <div className="flex items-start gap-2.5 p-2 bg-surface-subtle border border-border-subtle rounded-control mb-1">
            <MapPin className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium text-text-main">Location</p>
              <p className="text-text-muted mt-0.5">{text || 'Shared location'}</p>
            </div>
          </div>
        )}

        {/* Contact card */}
        {type === 'contact' && (
          <div className="flex items-center gap-2.5 p-2 bg-surface-subtle border border-border-subtle rounded-control mb-1">
            <UserIcon className="w-5 h-5 text-accent shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-text-main">{text || 'Contact card'}</p>
            </div>
          </div>
        )}

        {/* Standard Text */}
        {(type === 'text' || type === 'other') && (text || message.originalText) && (
          <div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {renderMessageText(text || message.originalText || '')}
            </p>
            <LinkPreviewCard text={text || message.originalText} />
          </div>
        )}

        {/* Timestamp, Edited, Star, Status footer */}
        <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-text-muted select-none">
          {isRevokedBySender && (
            <span
              className="text-[9px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider px-1 py-0.5 rounded bg-rose-100/60 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40"
              title="This message was deleted by the sender on WhatsApp, but preserved by Anti-Revoke"
            >
              Revoked
            </span>
          )}

          {editedAt && (
            <span className="flex items-center gap-0.5 text-[10px] text-text-muted italic" title="Edited message">
              <Edit2 className="w-2.5 h-2.5" />
              <span>Edited</span>
            </span>
          )}

          {isStarred && (
            <span title="Starred message">
              <Star className="w-3 h-3 fill-warning text-warning" />
            </span>
          )}

          <span>{formattedTime}</span>
          {renderStatus()}
        </div>

        {/* Grouped Reactions Bar (Under the bubble) */}
        {reactionGroups.length > 0 && (
          <div className="absolute -bottom-3 left-2 flex items-center gap-1 z-10 flex-wrap">
            {reactionGroups.map(([emoji, group]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact && onReact(id, group.hasReacted ? null : emoji)}
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-xs flex items-center gap-1 border shadow-subtle transition-all hover:scale-105',
                  group.hasReacted
                    ? 'bg-accent-soft border-accent/40 text-accent font-semibold'
                    : 'bg-surface border-border-subtle text-text-main hover:bg-surface-subtle',
                )}
                title={`Reactions: ${group.count} (${group.users.join(', ')})`}
              >
                <span>{emoji}</span>
                {group.count > 1 && <span className="text-[10px]">{group.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
