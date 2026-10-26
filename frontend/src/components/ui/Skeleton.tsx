import React from 'react';
import { cn } from '../../lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'rectangular' | 'circular' | 'rounded';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'rounded',
  className,
  ...props
}) => {
  const variantStyles = {
    rectangular: 'rounded-none',
    circular: 'rounded-full',
    rounded: 'rounded-control',
  };

  return (
    <div
      className={cn(
        'animate-pulse bg-surface-subtle border border-border-subtle/40',
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  );
};
