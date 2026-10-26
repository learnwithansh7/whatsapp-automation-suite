import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-fast"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Content */}
      <div
        className={cn(
          'relative w-full bg-surface border border-border-subtle rounded-card shadow-modal overflow-hidden z-10 flex flex-col',
          maxWidthStyles[maxWidth],
          className,
        )}
      >
        <div className="flex items-start justify-between p-5 pb-4 border-b border-border-subtle/70">
          <div>
            {title && (
              <h3 className="text-base font-semibold text-text-main tracking-tight">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors duration-fast outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};
