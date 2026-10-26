import React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-text-secondary select-none"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 flex items-center justify-center text-text-muted pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full bg-surface text-text-main placeholder:text-text-muted text-sm rounded-control border border-border-subtle px-3 py-2 outline-none transition-all duration-fast shadow-subtle',
              'focus:border-accent focus:ring-2 focus:ring-accent/20',
              'disabled:opacity-50 disabled:bg-surface-subtle disabled:cursor-not-allowed',
              leftIcon ? 'pl-9' : '',
              rightIcon ? 'pr-9' : '',
              error
                ? 'border-danger focus:border-danger focus:ring-danger/20 text-danger'
                : '',
              className,
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 flex items-center justify-center text-text-muted">
              {rightIcon}
            </div>
          )}
        </div>
        {error ? (
          <span className="text-xs text-danger font-medium">{error}</span>
        ) : helperText ? (
          <span className="text-xs text-text-muted">{helperText}</span>
        ) : null}
      </div>
    );
  },
);

Input.displayName = 'Input';
