import React from 'react';
import { cn } from '../../lib/utils';
import { Button, ButtonProps } from './Button';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: ButtonProps['variant'];
    icon?: React.ReactNode;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 max-w-sm mx-auto select-none',
        className,
      )}
      {...props}
    >
      <div className="w-12 h-12 rounded-full bg-surface-subtle border border-border-subtle flex items-center justify-center text-text-muted mb-4 shadow-subtle">
        {icon}
      </div>
      <h4 className="text-base font-semibold text-text-main tracking-tight mb-1.5">
        {title}
      </h4>
      {description && (
        <p className="text-xs text-text-muted leading-relaxed mb-5">
          {description}
        </p>
      )}
      {action && (
        <Button
          variant={action.variant || 'primary'}
          size="sm"
          onClick={action.onClick}
          leftIcon={action.icon}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
};
