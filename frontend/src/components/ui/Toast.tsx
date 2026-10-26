import React from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import { useToastStore, ToastItem } from '../../store/useToastStore';
import { cn } from '../../lib/utils';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: () => void }> = ({
  toast,
  onDismiss,
}) => {
  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />,
    error: <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />,
    info: <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />,
  };

  const borderAccents = {
    success: 'border-l-4 border-l-accent',
    error: 'border-l-4 border-l-danger',
    warning: 'border-l-4 border-l-warning',
    info: 'border-l-4 border-l-info',
  };

  return (
    <div
      className={cn(
        'pointer-events-auto bg-surface border border-border-subtle rounded-control p-3.5 shadow-popover flex items-start gap-3 transition-all duration-fast animate-in slide-in-from-bottom-2',
        borderAccents[toast.type],
      )}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        {toast.title && (
          <h4 className="text-xs font-semibold text-text-main">{toast.title}</h4>
        )}
        <p className="text-xs text-text-secondary leading-relaxed break-words">
          {toast.message}
        </p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss toast"
        className="p-1 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
