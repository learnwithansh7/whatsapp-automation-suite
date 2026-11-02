import React, { useState, useEffect, useRef } from 'react';
import {
  Pin,
  Archive,
  Volume2,
  VolumeX,
  Mail,
  MailOpen,
  Check,
  Clock,
  Bot,
} from 'lucide-react';
import type { ChatItem } from '../../lib/api';
import { cn } from '../../lib/utils';

interface ChatContextMenuProps {
  chat: ChatItem;
  isOpen: boolean;
  position?: { x: number; y: number } | null;
  onClose: () => void;
  onPin: (chat: ChatItem) => void;
  onArchive: (chat: ChatItem) => void;
  onMute: (chat: ChatItem, duration: '8h' | '1w' | 'always' | null) => void;
  onMarkUnread: (chat: ChatItem) => void;
  onToggleAi?: (chat: ChatItem) => void;
}

export const ChatContextMenu: React.FC<ChatContextMenuProps> = ({
  chat,
  isOpen,
  position,
  onClose,
  onPin,
  onArchive,
  onMute,
  onMarkUnread,
  onToggleAi,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMuteSubmenu, setShowMuteSubmenu] = useState(false);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Calculate coordinates ensuring menu doesn't overflow screen bounds
  const style: React.CSSProperties = position
    ? {
        position: 'fixed',
        left: `${Math.min(position.x, window.innerWidth - 220)}px`,
        top: `${Math.min(position.y, window.innerHeight - 260)}px`,
        zIndex: 50,
      }
    : {
        position: 'absolute',
        right: '12px',
        top: '36px',
        zIndex: 50,
      };

  return (
    <div
      ref={menuRef}
      style={style}
      className="w-52 rounded-card bg-surface border border-border-subtle shadow-card py-1 text-xs text-text-main animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      {/* Pin / Unpin */}
      <button
        type="button"
        onClick={() => {
          onPin(chat);
          onClose();
        }}
        className="w-full px-3 py-2 text-left hover:bg-surface-subtle flex items-center justify-between gap-2 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Pin className={cn('w-3.5 h-3.5', chat.isPinned ? 'text-accent fill-accent' : 'text-text-muted')} />
          <span>{chat.isPinned ? 'Unpin chat' : 'Pin chat'}</span>
        </span>
        <span className="text-[10px] text-text-muted">Ctrl+Shift+P</span>
      </button>

      {/* Archive / Unarchive */}
      <button
        type="button"
        onClick={() => {
          onArchive(chat);
          onClose();
        }}
        className="w-full px-3 py-2 text-left hover:bg-surface-subtle flex items-center justify-between gap-2 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Archive className="w-3.5 h-3.5 text-text-muted" />
          <span>{chat.isArchived ? 'Unarchive chat' : 'Archive chat'}</span>
        </span>
        <span className="text-[10px] text-text-muted">Ctrl+Shift+A</span>
      </button>

      {/* Mute Options */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowMuteSubmenu(!showMuteSubmenu)}
          className="w-full px-3 py-2 text-left hover:bg-surface-subtle flex items-center justify-between gap-2 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            {chat.isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-text-muted" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-text-muted" />
            )}
            <span>{chat.isMuted ? 'Muted' : 'Mute notifications'}</span>
          </span>
          <span className="text-[10px] text-text-muted font-mono">{showMuteSubmenu ? '▲' : '▶'}</span>
        </button>

        {showMuteSubmenu && (
          <div className="bg-surface-subtle/80 border-y border-border-subtle/60 py-1 flex flex-col">
            {chat.isMuted ? (
              <button
                type="button"
                onClick={() => {
                  onMute(chat, null);
                  onClose();
                }}
                className="w-full px-5 py-1.5 text-left hover:bg-surface text-[11px] text-accent font-medium flex items-center gap-1.5"
              >
                <Check className="w-3 h-3" />
                <span>Unmute notifications</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onMute(chat, '8h');
                    onClose();
                  }}
                  className="w-full px-5 py-1.5 text-left hover:bg-surface text-[11px] text-text-secondary flex items-center gap-1.5"
                >
                  <Clock className="w-3 h-3 text-text-muted" />
                  <span>8 Hours</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onMute(chat, '1w');
                    onClose();
                  }}
                  className="w-full px-5 py-1.5 text-left hover:bg-surface text-[11px] text-text-secondary flex items-center gap-1.5"
                >
                  <Clock className="w-3 h-3 text-text-muted" />
                  <span>1 Week</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onMute(chat, 'always');
                    onClose();
                  }}
                  className="w-full px-5 py-1.5 text-left hover:bg-surface text-[11px] text-text-secondary flex items-center gap-1.5"
                >
                  <Clock className="w-3 h-3 text-text-muted" />
                  <span>Always</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="my-1 border-t border-border-subtle/60" />

      {/* Mark as Unread / Read */}
      <button
        type="button"
        onClick={() => {
          onMarkUnread(chat);
          onClose();
        }}
        className="w-full px-3 py-2 text-left hover:bg-surface-subtle flex items-center justify-between gap-2 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          {chat.markedUnread || chat.unreadCount > 0 ? (
            <MailOpen className="w-3.5 h-3.5 text-text-muted" />
          ) : (
            <Mail className="w-3.5 h-3.5 text-accent" />
          )}
          <span>{chat.markedUnread || chat.unreadCount > 0 ? 'Mark as read' : 'Mark as unread'}</span>
        </span>
        <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-surface-subtle text-text-muted border border-border-subtle">
          Local only
        </span>
      </button>

      {/* Toggle AI Auto-Reply (1-on-1 private chats only) */}
      {chat.type !== 'group' && onToggleAi && (
        <button
          type="button"
          onClick={() => {
            onToggleAi(chat);
            onClose();
          }}
          className="w-full px-3 py-2 text-left hover:bg-surface-subtle flex items-center justify-between gap-2 transition-colors cursor-pointer border-t border-border-subtle/50"
        >
          <span className="flex items-center gap-2">
            <Bot className={cn('w-3.5 h-3.5', chat.aiEnabled ? 'text-accent' : 'text-text-muted')} />
            <span>{chat.aiEnabled ? 'Disable AI Auto-Reply' : 'Enable AI Auto-Reply'}</span>
          </span>
          <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-accent-soft text-accent border border-accent/20">
            {chat.aiEnabled ? 'ON' : 'OFF'}
          </span>
        </button>
      )}
    </div>
  );
};
