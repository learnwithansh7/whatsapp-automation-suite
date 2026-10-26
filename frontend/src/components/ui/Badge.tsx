import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  dot = false,
  className,
  children,
  ...props
}) => {
  const variantStyles = {
    default:
      'bg-surface-subtle text-text-secondary border-border-subtle',
    success:
      'bg-accent-soft text-accent border-accent/25 dark:border-accent/40',
    danger:
      'bg-danger-soft text-danger border-danger/25 dark:border-danger/40',
    warning:
      'bg-warning-soft text-warning border-warning/25 dark:border-warning/40',
    info:
      'bg-info-soft text-info border-info/25 dark:border-info/40',
  };

  const dotColors = {
    default: 'bg-text-muted',
    success: 'bg-accent',
    danger: 'bg-danger',
    warning: 'bg-warning',
    info: 'bg-info',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-1.5 py-0.5 gap-1 font-medium',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border leading-none select-none transition-colors duration-fast',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant])}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </span>
  );
};
