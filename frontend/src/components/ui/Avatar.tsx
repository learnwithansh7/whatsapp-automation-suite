import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'busy';
  isGroup?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  name,
  size = 'md',
  status,
  isGroup = false,
  className,
  ...props
}) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Reset error & loaded status when src prop updates
  useEffect(() => {
    setImgError(false);
    setImgLoaded(false);
  }, [src]);

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-xs',
    lg: 'w-11 h-11 text-sm',
    xl: 'w-14 h-14 text-base',
  };

  const statusSizeClasses = {
    sm: 'w-2 h-2 ring-1',
    md: 'w-2.5 h-2.5 ring-2',
    lg: 'w-3 h-3 ring-2',
    xl: 'w-3.5 h-3.5 ring-2',
  };

  const statusColors = {
    online: 'bg-accent',
    offline: 'bg-text-muted',
    busy: 'bg-danger',
  };

  const getInitials = (text?: string) => {
    if (!text) return '?';
    const parts = text.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return text.substring(0, 2).toUpperCase();
  };

  const hasImage = !!src && !imgError;

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center shrink-0 rounded-full select-none overflow-hidden bg-surface-subtle text-text-secondary border border-border-subtle font-medium',
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {hasImage ? (
        <img
          src={src}
          alt={alt || name || 'Avatar'}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          className={cn(
            'w-full h-full object-cover transition-opacity duration-fast',
            imgLoaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : isGroup ? (
        <Users className="w-1/2 h-1/2 text-text-muted stroke-[1.75]" />
      ) : (
        <span>{getInitials(name || alt)}</span>
      )}

      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-surface z-10',
            statusSizeClasses[size],
            statusColors[status],
          )}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
