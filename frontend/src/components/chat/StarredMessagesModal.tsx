import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star, ArrowRight } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { api } from '../../lib/api';
import { formatChatTimestamp } from '../../lib/formatters';

interface StarredMessagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onJumpToChat: (chatJid: string, messageId: string) => void;
}

export const StarredMessagesModal: React.FC<StarredMessagesModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  onJumpToChat,
}) => {
  const { data, isLoading } = useQuery({
    queryKey: ['starredMessages', sessionId],
    queryFn: () => api.getStarredMessages(sessionId),
    enabled: isOpen && !!sessionId,
  });

  if (!isOpen) return null;

  const messages = data?.starredMessages || [];

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Starred Messages">
      <div className="flex flex-col gap-3">
        {isLoading ? (
          <div className="p-12 flex items-center justify-center">
            <Spinner size="md" />
          </div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center gap-2 text-text-muted">
            <div className="w-12 h-12 rounded-full bg-surface-subtle flex items-center justify-center text-text-muted">
              <Star className="w-6 h-6 stroke-[1.5]" />
            </div>
            <p className="text-sm font-medium text-text-main">No starred messages</p>
            <p className="text-xs max-w-[260px]">
              Tap the message action menu on any message and select "Star" to keep it here for quick access.
            </p>
          </div>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto divide-y divide-border-subtle/50 rounded-control border border-border-subtle">
            {messages.map((m) => (
              <div
                key={m.id}
                className="p-3.5 hover:bg-surface-subtle transition-colors flex flex-col gap-1.5"
              >
                {/* Chat header & timestamp */}
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text-main truncate max-w-[200px]">
                    {m.chatTitle || m.chatJid}
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {formatChatTimestamp(m.timestamp)}
                  </span>
                </div>

                {/* Sender badge & content snippet */}
                <div className="text-xs text-text-secondary bg-surface rounded-control p-2 border border-border-subtle/50">
                  <div className="text-[11px] font-medium text-accent mb-0.5">
                    {m.fromMe ? 'You' : m.senderName || 'Contact'}
                  </div>
                  <p className="truncate text-text-main text-xs">
                    {m.text || m.caption || m.mediaFileName || (m.type === 'audio' ? 'Voice note' : 'Attachment')}
                  </p>
                </div>

                {/* Jump to chat button */}
                <div className="flex justify-end pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onJumpToChat(m.chatJid, m.id);
                      onClose();
                    }}
                    rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                    className="text-xs text-accent hover:text-accent-hover h-7 px-2"
                  >
                    Go to chat
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-border-subtle">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
