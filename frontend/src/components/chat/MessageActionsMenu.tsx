import React, { useState, useEffect, useRef } from 'react';
import {
  MoreVertical,
  CornerUpLeft,
  Copy,
  Forward,
  Star,
  Edit2,
  Trash2,
} from 'lucide-react';
import type { MessageItem } from '../../lib/api';
import { cn } from '../../lib/utils';

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
export const MORE_EMOJIS = ['🔥', '🎉', '👏', '💯', '🤔', '👀', '✨', '💔', '🤝', '🚀'];

interface MessageActionsMenuProps {
  message: MessageItem;
  fromMe: boolean;
  onReact: (emoji: string | null) => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onStar: (star: boolean) => void;
  onEdit?: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone?: () => void;
}

export const MessageActionsMenu: React.FC<MessageActionsMenuProps> = ({
  message,
  fromMe,
  onReact,
  onReply,
  onCopy,
  onForward,
  onStar,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showMoreEmojis, setShowMoreEmojis] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Time window checks
  const messageTime = new Date(message.timestamp).getTime();
  const ageMs = Date.now() - messageTime;
  const canEdit = fromMe && message.type === 'text' && !message.isDeleted && ageMs <= 15 * 60 * 1000;
  const canDeleteForEveryone = fromMe && !message.isDeleted && ageMs <= 48 * 60 * 60 * 1000;

  // Close on outside click or Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setShowMoreEmojis(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowMoreEmojis(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectEmoji = (emoji: string) => {
    onReact(emoji);
    setIsOpen(false);
    setShowMoreEmojis(false);
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'p-1.5 rounded-full bg-surface/90 hover:bg-surface border border-border-subtle text-text-muted hover:text-text-main shadow-subtle transition-opacity duration-fast z-10',
          isOpen ? 'opacity-100 ring-2 ring-accent/30' : 'opacity-0 group-hover:opacity-100',
        )}
        title="Message options"
        aria-label="Message options"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute top-8 w-56 bg-surface border border-border-subtle rounded-card shadow-card py-1.5 z-50 text-xs flex flex-col',
            fromMe ? 'right-0' : 'left-0',
          )}
        >
          {/* Quick Reaction Bar */}
          <div className="px-2 py-1.5 border-b border-border-subtle flex items-center justify-between gap-1 bg-surface-subtle/50">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelectEmoji(emoji)}
                className="w-7 h-7 flex items-center justify-center rounded-control hover:bg-surface hover:scale-125 transition-transform text-sm"
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowMoreEmojis(!showMoreEmojis)}
              className="w-6 h-6 flex items-center justify-center rounded-control text-text-muted hover:text-text-main text-[11px]"
              title="More emojis"
            >
              +
            </button>
          </div>

          {/* More Emojis Row if expanded */}
          {showMoreEmojis && (
            <div className="px-2 py-1.5 border-b border-border-subtle grid grid-cols-5 gap-1 bg-surface-subtle">
              {MORE_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSelectEmoji(emoji)}
                  className="w-7 h-7 flex items-center justify-center rounded-control hover:bg-surface hover:scale-125 transition-transform text-sm"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Reply */}
          <button
            type="button"
            onClick={() => {
              onReply();
              setIsOpen(false);
            }}
            className="px-3 py-2 text-left flex items-center gap-2 hover:bg-surface-subtle text-text-main transition-colors"
          >
            <CornerUpLeft className="w-3.5 h-3.5 text-text-muted" />
            <span>Reply</span>
          </button>

          {/* Copy */}
          {(message.text || message.caption) && (
            <button
              type="button"
              onClick={() => {
                onCopy();
                setIsOpen(false);
              }}
              className="px-3 py-2 text-left flex items-center gap-2 hover:bg-surface-subtle text-text-main transition-colors"
            >
              <Copy className="w-3.5 h-3.5 text-text-muted" />
              <span>Copy</span>
            </button>
          )}

          {/* Forward */}
          <button
            type="button"
            onClick={() => {
              onForward();
              setIsOpen(false);
            }}
            className="px-3 py-2 text-left flex items-center gap-2 hover:bg-surface-subtle text-text-main transition-colors"
          >
            <Forward className="w-3.5 h-3.5 text-text-muted" />
            <span>Forward</span>
          </button>

          {/* Star / Unstar */}
          <button
            type="button"
            onClick={() => {
              onStar(!message.isStarred);
              setIsOpen(false);
            }}
            className="px-3 py-2 text-left flex items-center gap-2 hover:bg-surface-subtle text-text-main transition-colors"
          >
            <Star
              className={cn(
                'w-3.5 h-3.5',
                message.isStarred ? 'fill-warning text-warning' : 'text-text-muted',
              )}
            />
            <span>{message.isStarred ? 'Unstar' : 'Star'}</span>
          </button>

          {/* Edit (only own text <= 15m) */}
          {canEdit && onEdit && (
            <button
              type="button"
              onClick={() => {
                onEdit();
                setIsOpen(false);
              }}
              className="px-3 py-2 text-left flex items-center gap-2 hover:bg-surface-subtle text-text-main transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5 text-text-muted" />
              <span>Edit message</span>
            </button>
          )}

          {/* Delete options */}
          <div className="border-t border-border-subtle mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                onDeleteForMe();
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-surface-subtle text-text-secondary transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-text-muted" />
              <span>Delete for me</span>
            </button>

            {canDeleteForEveryone && onDeleteForEveryone && (
              <button
                type="button"
                onClick={() => {
                  onDeleteForEveryone();
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-danger-soft text-danger transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete for everyone</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
