import React from 'react';
import { Dialog } from '../ui/Dialog';
import { Command } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  const shortcuts = [
    { key: 'Esc', desc: 'Close dialogs, lightbox, info panel, or cancel reply/edit' },
    { key: 'Ctrl + Shift + P', desc: 'Pin or unpin selected chat' },
    { key: 'Ctrl + Shift + A', desc: 'Archive or unarchive selected chat' },
    { key: '↑ / ↓', desc: 'Navigate up and down through the chat list' },
    { key: 'Enter', desc: 'Open selected chat (or send message when in input)' },
    { key: 'Shift + Enter', desc: 'Insert new line in message input' },
    { key: '↑ (in empty input)', desc: 'Edit your last sent text message (within 15 min)' },
    { key: '?', desc: 'Open this keyboard shortcuts cheat sheet' },
  ];

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Keyboard Shortcuts">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-3 border-b border-border-subtle text-xs text-text-muted">
          <Command className="w-4 h-4 text-accent shrink-0" />
          <span>Quick actions and navigation without touching the mouse.</span>
        </div>

        <div className="flex flex-col divide-y divide-border-subtle/50">
          {shortcuts.map((s) => (
            <div key={s.key} className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-xs text-text-main font-medium">{s.desc}</span>
              <kbd className="px-2 py-1 rounded bg-surface-subtle border border-border-subtle text-text-main text-[11px] font-mono shadow-subtle shrink-0">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
};
