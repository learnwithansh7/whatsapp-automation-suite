import React, { useState } from 'react';
import {
  Search,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Mic,
  Send,
  Phone,
  Video,
  Info,
  ChevronLeft,
  CheckCheck,
} from 'lucide-react';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { useUIStore } from '../store/useUIStore';
import { cn } from '../lib/utils';

interface MockChat {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  unreadCount?: number;
  isOnline?: boolean;
  isGroup?: boolean;
}

const mockChats: MockChat[] = [
  {
    id: '1',
    name: 'Anirudh (You)',
    lastMessage: 'All services are connected and ready for Phase 1.',
    time: '10:42 PM',
    unreadCount: 0,
    isOnline: true,
  },
  {
    id: '2',
    name: 'Product Team',
    lastMessage: 'The new Clean Light design tokens are ready.',
    time: '09:15 PM',
    unreadCount: 3,
    isGroup: true,
  },
  {
    id: '3',
    name: 'Sarah Connor',
    lastMessage: 'Are we testing Baileys linked device login today?',
    time: 'Yesterday',
    unreadCount: 1,
  },
  {
    id: '4',
    name: 'Client Support Hub',
    lastMessage: 'Ticket #4081 has been resolved by automation.',
    time: 'Friday',
    unreadCount: 0,
    isGroup: true,
  },
];

export const ChatsView: React.FC = () => {
  const [selectedChatId, setSelectedChatId] = useState<string | null>('1');
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const [showRightPanel, setShowRightPanel] = useState<boolean>(false);
  const [messageInput, setMessageInput] = useState<string>('');
  const { mobileView, setMobileView } = useUIStore();

  const selectedChat = mockChats.find((c) => c.id === selectedChatId);

  const handleSelectChat = (id: string) => {
    setSelectedChatId(id);
    setMobileView('chat');
  };

  return (
    <div className="flex-1 flex w-full h-full overflow-hidden bg-app">
      {/* Column 1: Chat List (~360px on desktop) */}
      <section
        className={cn(
          'w-full md:w-[360px] md:shrink-0 flex flex-col bg-surface border-r border-border-subtle h-full',
          mobileView === 'chat' ? 'hidden md:flex' : 'flex',
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text-main tracking-tight">Chats</h2>
          <div className="flex items-center gap-2">
            <button
              aria-label="New chat options"
              className="p-2 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors"
            >
              <MoreVertical className="w-5 h-5 stroke-[1.75]" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 py-2.5 border-b border-border-subtle/50">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-text-muted absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search or start a new chat"
              className="w-full bg-surface-subtle text-text-main placeholder:text-text-muted text-xs rounded-control pl-9 pr-3 py-2 outline-none border border-transparent focus:border-accent focus:bg-surface transition-all duration-fast"
            />
          </div>

          {/* Quick Filter Pills */}
          <div className="flex items-center gap-1.5 mt-2.5">
            <button
              onClick={() => setFilter('all')}
              className={cn(
                'px-2.5 py-1 text-xs rounded-full font-medium transition-colors',
                filter === 'all'
                  ? 'bg-accent-soft text-accent border border-accent/20'
                  : 'text-text-secondary hover:bg-surface-subtle',
              )}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={cn(
                'px-2.5 py-1 text-xs rounded-full font-medium transition-colors',
                filter === 'unread'
                  ? 'bg-accent-soft text-accent border border-accent/20'
                  : 'text-text-secondary hover:bg-surface-subtle',
              )}
            >
              Unread
            </button>
            <button
              onClick={() => setFilter('groups')}
              className={cn(
                'px-2.5 py-1 text-xs rounded-full font-medium transition-colors',
                filter === 'groups'
                  ? 'bg-accent-soft text-accent border border-accent/20'
                  : 'text-text-secondary hover:bg-surface-subtle',
              )}
            >
              Groups
            </button>
          </div>
        </div>

        {/* Chat List Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/40">
          {mockChats.map((chat) => {
            const isSelected = selectedChatId === chat.id;
            return (
              <div
                key={chat.id}
                onClick={() => handleSelectChat(chat.id)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors duration-fast',
                  isSelected
                    ? 'bg-surface-subtle'
                    : 'hover:bg-surface-subtle/60 active:bg-surface-subtle',
                )}
              >
                <Avatar
                  name={chat.name}
                  status={chat.isOnline ? 'online' : undefined}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium text-text-main truncate">
                      {chat.name}
                    </span>
                    <span className="text-[11px] text-text-muted shrink-0">
                      {chat.time}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-text-muted truncate leading-relaxed">
                      {chat.lastMessage}
                    </p>
                    {chat.unreadCount ? (
                      <span className="shrink-0 w-4 h-4 rounded-full bg-accent text-white text-[10px] font-semibold flex items-center justify-center">
                        {chat.unreadCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Column 2: Chat Window */}
      <section
        className={cn(
          'flex-1 flex flex-col h-full bg-app overflow-hidden',
          mobileView === 'list' ? 'hidden md:flex' : 'flex',
        )}
      >
        {selectedChat ? (
          <>
            {/* Chat Top Header */}
            <div className="h-16 px-4 bg-surface border-b border-border-subtle flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {/* Back button on mobile */}
                <button
                  onClick={() => setMobileView('list')}
                  className="md:hidden p-1.5 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle"
                >
                  <ChevronLeft className="w-5 h-5 stroke-[1.75]" />
                </button>

                <Avatar
                  name={selectedChat.name}
                  size="md"
                  status={selectedChat.isOnline ? 'online' : undefined}
                />
                <div>
                  <h3 className="text-sm font-semibold text-text-main tracking-tight leading-tight">
                    {selectedChat.name}
                  </h3>
                  <p className="text-[11px] text-text-muted leading-tight">
                    {selectedChat.isOnline ? 'online' : 'last seen recently'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 text-text-muted">
                <button
                  aria-label="Voice Call"
                  className="p-2 rounded-control hover:text-text-main hover:bg-surface-subtle transition-colors"
                >
                  <Phone className="w-4 h-4 stroke-[1.75]" />
                </button>
                <button
                  aria-label="Video Call"
                  className="p-2 rounded-control hover:text-text-main hover:bg-surface-subtle transition-colors"
                >
                  <Video className="w-4 h-4 stroke-[1.75]" />
                </button>
                <button
                  aria-label="Chat Info Panel"
                  onClick={() => setShowRightPanel(!showRightPanel)}
                  className={cn(
                    'p-2 rounded-control hover:text-text-main hover:bg-surface-subtle transition-colors',
                    showRightPanel && 'bg-surface-subtle text-accent',
                  )}
                >
                  <Info className="w-4 h-4 stroke-[1.75]" />
                </button>
              </div>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col gap-3">
              {/* Timestamp separator */}
              <div className="flex justify-center my-2">
                <span className="text-[11px] font-medium text-text-muted px-2.5 py-0.5 rounded-full bg-surface-subtle border border-border-subtle/60 shadow-subtle">
                  Today
                </span>
              </div>

              {/* Message In */}
              <div className="flex justify-start max-w-[80%] md:max-w-[65%]">
                <div className="bg-chat-bubble-in text-text-main border border-border-subtle/80 rounded-card rounded-tl-sm p-3 shadow-card">
                  <p className="text-sm leading-relaxed">
                    Welcome to the new WhatsApp Client frontend. The design tokens have been updated to Clean Light style!
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-text-muted">10:40 PM</span>
                  </div>
                </div>
              </div>

              {/* Message Out */}
              <div className="flex justify-end self-end max-w-[80%] md:max-w-[65%]">
                <div className="bg-chat-bubble-out text-text-main border border-border-subtle/40 rounded-card rounded-tr-sm p-3 shadow-card">
                  <p className="text-sm leading-relaxed">
                    Looks crisp and professional! The 3-column layout and Inter typography feel very clean.
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-text-muted">10:42 PM</span>
                    <CheckCheck className="w-3.5 h-3.5 text-info" />
                  </div>
                </div>
              </div>
            </div>

            {/* Chat Input Bar */}
            <div className="p-3 bg-surface border-t border-border-subtle flex items-center gap-2 shrink-0">
              <button
                aria-label="Attach File"
                className="p-2 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors"
              >
                <Paperclip className="w-5 h-5 stroke-[1.75]" />
              </button>

              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type a message (ready for Phase 1 Baileys integration)"
                className="flex-1 bg-surface-subtle text-text-main placeholder:text-text-muted text-sm rounded-control px-3.5 py-2 outline-none border border-transparent focus:border-accent focus:bg-surface transition-all duration-fast"
              />

              {messageInput.trim().length > 0 ? (
                <button
                  aria-label="Send Message"
                  className="p-2 rounded-control bg-accent hover:bg-accent-hover text-white transition-colors shadow-subtle"
                >
                  <Send className="w-5 h-5 stroke-[1.75]" />
                </button>
              ) : (
                <button
                  aria-label="Voice Message"
                  className="p-2 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors"
                >
                  <Mic className="w-5 h-5 stroke-[1.75]" />
                </button>
              )}
            </div>
          </>
        ) : (
          <EmptyState
            icon={<MessageSquare className="w-6 h-6" />}
            title="No chat selected"
            description="Choose a conversation from the list to start messaging."
          />
        )}
      </section>

      {/* Column 3: Optional Right Info Panel (~300px) */}
      {showRightPanel && selectedChat && (
        <aside className="hidden lg:flex flex-col w-[300px] shrink-0 bg-surface border-l border-border-subtle p-5 overflow-y-auto">
          <div className="flex flex-col items-center text-center pb-5 border-b border-border-subtle">
            <Avatar name={selectedChat.name} size="xl" className="mb-3" />
            <h3 className="text-base font-semibold text-text-main tracking-tight">
              {selectedChat.name}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">+91 98765 43210</p>
            <div className="mt-3">
              <Badge variant="success" dot>
                Linked Device Ready
              </Badge>
            </div>
          </div>

          <div className="py-4 border-b border-border-subtle flex flex-col gap-2">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              About
            </span>
            <p className="text-xs text-text-secondary leading-relaxed">
              Hey there! I am using this custom WhatsApp client web app.
            </p>
          </div>

          <div className="py-4 flex flex-col gap-2">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Media, Links & Docs
            </span>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <div className="aspect-square bg-surface-subtle rounded-control border border-border-subtle flex items-center justify-center text-[10px] text-text-muted">
                Doc
              </div>
              <div className="aspect-square bg-surface-subtle rounded-control border border-border-subtle flex items-center justify-center text-[10px] text-text-muted">
                Image
              </div>
              <div className="aspect-square bg-surface-subtle rounded-control border border-border-subtle flex items-center justify-center text-[10px] text-text-muted">
                Link
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};
