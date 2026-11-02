import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Globe } from 'lucide-react';
import { api, type LinkPreviewItem } from '../../lib/api';
import { useUIStore } from '../../store/useUIStore';

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/i;

interface LinkPreviewCardProps {
  text: string | null | undefined;
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ text }) => {
  const showLinkPreviews = useUIStore((s) => s.showLinkPreviews);

  if (!text || !showLinkPreviews) return null;

  const match = text.match(URL_REGEX);
  if (!match) return null;

  const url = match[0];

  const { data, isLoading } = useQuery<{ preview: LinkPreviewItem }>({
    queryKey: ['linkPreview', url],
    queryFn: () => api.getLinkPreview(url),
    enabled: Boolean(url && showLinkPreviews),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mt-2 p-2.5 rounded-control bg-surface-subtle/80 border border-border-subtle/80 flex items-center gap-3 animate-pulse">
        <div className="w-12 h-12 rounded bg-border-subtle/40 shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="h-3 w-3/4 bg-border-subtle/40 rounded" />
          <div className="h-2.5 w-1/2 bg-border-subtle/40 rounded" />
        </div>
      </div>
    );
  }

  const preview = data?.preview;
  if (!preview || preview.status === 'failed' || (!preview.title && !preview.imageUrl)) {
    return null;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block rounded-control overflow-hidden border border-border-subtle bg-surface-subtle/70 hover:bg-surface-subtle transition-colors group select-none shadow-subtle"
    >
      <div className="flex flex-col sm:flex-row items-stretch">
        {/* Thumbnail Image */}
        {preview.imageUrl && (
          <div className="sm:w-28 sm:shrink-0 h-28 bg-surface border-b sm:border-b-0 sm:border-r border-border-subtle/60 overflow-hidden relative">
            <img
              src={preview.imageUrl}
              alt={preview.title || 'Link thumbnail'}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-fast"
              loading="lazy"
              onError={(e) => {
                // Hide broken images
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-2.5 flex flex-col justify-center min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted mb-1 truncate">
            <Globe className="w-3 h-3 shrink-0 text-accent" />
            <span className="font-medium truncate">{preview.siteName || new URL(url).hostname}</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-60 ml-auto shrink-0" />
          </div>

          {preview.title && (
            <h5 className="text-xs font-semibold text-text-main line-clamp-1 group-hover:text-accent transition-colors leading-tight">
              {preview.title}
            </h5>
          )}

          {preview.description && (
            <p className="text-[11px] text-text-muted line-clamp-2 mt-1 leading-snug">
              {preview.description}
            </p>
          )}
        </div>
      </div>
    </a>
  );
};
