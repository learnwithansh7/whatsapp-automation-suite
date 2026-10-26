import React from 'react';
import { cn } from '../../lib/utils';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-xs font-medium text-text-secondary select-none"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full bg-surface text-text-main placeholder:text-text-muted text-sm rounded-control border border-border-subtle p-3 outline-none transition-all duration-fast shadow-subtle min-h-[90px]',
            'focus:border-accent focus:ring-2 focus:ring-accent/20',
            'disabled:opacity-50 disabled:bg-surface-subtle disabled:cursor-not-allowed',
            error
              ? 'border-danger focus:border-danger focus:ring-danger/20 text-danger'
              : '',
            className,
          )}
          {...props}
        />
        {error ? (
          <span className="text-xs text-danger font-medium">{error}</span>
        ) : helperText ? (
          <span className="text-xs text-text-muted">{helperText}</span>
        ) : null}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
