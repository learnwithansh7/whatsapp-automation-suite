import React from 'react';
import { cn } from '../../lib/utils';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  id,
  size = 'md',
  className,
}) => {
  const switchId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  const sizeClasses = {
    sm: {
      container: 'w-7 h-4',
      dot: 'w-3 h-3',
      translate: 'translate-x-3.5',
    },
    md: {
      container: 'w-10 h-6',
      dot: 'w-4 h-4',
      translate: 'translate-x-4.5',
    },
  };

  return (
    <div className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative inline-flex shrink-0 items-center rounded-full transition-colors duration-fast border border-border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          checked ? 'bg-accent border-accent' : 'bg-surface-subtle',
          disabled && 'opacity-50 cursor-not-allowed',
          sizeClasses[size].container,
        )}
      >
        <span
          className={cn(
            'inline-block rounded-full bg-white shadow-subtle transition-transform duration-fast',
            checked ? sizeClasses[size].translate : 'translate-x-0.5',
            sizeClasses[size].dot,
          )}
        />
      </button>
      {label && (
        <label
          htmlFor={switchId}
          onClick={() => !disabled && onChange(!checked)}
          className={cn(
            'text-sm font-medium text-text-secondary cursor-pointer',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {label}
        </label>
      )}
    </div>
  );
};
