import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Forward, Check } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Avatar } from '../ui/Avatar';
import { Spinner } from '../ui/Spinner';
import { api, type ChatItem, type MessageItem } from '../../lib/api';
import { cn } from '../../lib/utils';

interface ForwardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  message: MessageItem | null;
  sessionId: string;
  onForward: (targetChatJids: string[]) => void;
  isForwarding: boolean;
}

export const ForwardDialog: React.FC<ForwardDialogProps> = ({
  isOpen,
  onClose,
  message,
  sessionId,
  onForward,
  isForwarding,
}) => {
  const [search, setSearch] = useState('');
  const [selectedJids, setSelectedJids] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['chats', sessionId, search],
    queryFn: () => api.getChats(sessionId, { search: search || undefined, limit: 50 }),
    enabled: isOpen && !!sessionId,
  });

  const toggleSelect = (jid: string) => {
    if (selectedJids.includes(jid)) {
      setSelectedJids(selectedJids.filter((j) => j !== jid));
    } else {
      if (selectedJids.length >= 5) {
        return; // Max 5 limit enforced
      }
      setSelectedJids([...selectedJids, jid]);
    }
  };

  const handleConfirm = () => {
    if (selectedJids.length === 0 || selectedJids.length > 5) return;
    onForward(selectedJids);
  };

  if (!isOpen) return null;

  const chats = data?.chats || [];

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Forward message">
      <div className="flex flex-col gap-4">
        {/* Message preview snippet */}
        {message && (
          <div className="p-3 bg-surface-subtle border border-border-subtle rounded-control text-xs text-text-muted flex items-center gap-2">
            <Forward className="w-4 h-4 text-accent shrink-0" />
            <p className="truncate text-text-main font-medium">
              {message.text || message.caption || message.mediaFileName || 'Attachment'}
            </p>
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <Input
            placeholder="Search chats to forward to..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-text-muted" />}
            className="w-full"
            autoFocus
          />
        </div>

        {/* Selected count info */}
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>
            Selected: <strong className="text-text-main">{selectedJids.length}</strong> / 5 chats
          </span>
          {selectedJids.length >= 5 && (
            <span className="text-warning text-[11px] font-medium">Maximum 5 chats reached</span>
          )}
        </div>

        {/* Chat List */}
        <div className="max-h-60 overflow-y-auto divide-y divide-border-subtle/50 rounded-control border border-border-subtle">
          {isLoading ? (
            <div className="p-8 flex items-center justify-center">
              <Spinner size="md" />
            </div>
          ) : chats.length === 0 ? (
            <div className="p-6 text-center text-xs text-text-muted">No chats found.</div>
          ) : (
            chats.map((chat: ChatItem) => {
              const isSelected = selectedJids.includes(chat.jid);
              const isMaxedOut = !isSelected && selectedJids.length >= 5;

              return (
                <div
                  key={chat.jid}
                  onClick={() => !isMaxedOut && toggleSelect(chat.jid)}
                  className={cn(
                    'p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors',
                    isSelected ? 'bg-accent-soft/40' : 'hover:bg-surface-subtle',
                    isMaxedOut && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      name={chat.displayName}
                      src={chat.profilePictureUrl || undefined}
                      isGroup={chat.type === 'group'}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-text-main truncate">
                        {chat.displayName}
                      </p>
                      <p className="text-[10px] text-text-muted truncate">
                        {chat.type === 'group' ? 'Group' : chat.phoneNumber ? `+${chat.phoneNumber}` : chat.jid}
                      </p>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'w-5 h-5 rounded border flex items-center justify-center transition-colors',
                      isSelected
                        ? 'bg-accent border-accent text-white'
                        : 'border-border-strong bg-surface',
                    )}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isForwarding}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            isLoading={isForwarding}
            disabled={selectedJids.length === 0}
            leftIcon={<Forward className="w-4 h-4" />}
          >
            Forward {selectedJids.length > 0 ? `(${selectedJids.length})` : ''}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
