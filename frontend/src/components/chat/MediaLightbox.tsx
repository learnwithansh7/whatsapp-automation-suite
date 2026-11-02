import React, { useEffect } from 'react';
import { X, Download } from 'lucide-react';

interface MediaLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  type: 'image' | 'video';
  fileName?: string;
  caption?: string | null;
}

export const MediaLightbox: React.FC<MediaLightboxProps> = ({
  isOpen,
  onClose,
  src,
  type,
  fileName,
  caption,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-fast"
      onClick={onClose}
    >
      {/* Top action bar */}
      <div
        className="absolute top-4 right-4 flex items-center gap-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={src}
          download={fileName || (type === 'video' ? 'video.mp4' : 'image.jpg')}
          className="p-2.5 rounded-full bg-surface/90 text-text-main hover:bg-surface shadow-card transition-colors"
          title="Download file"
          aria-label="Download file"
        >
          <Download className="w-5 h-5 stroke-[1.75]" />
        </a>
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-surface/90 text-text-main hover:bg-surface shadow-card transition-colors"
          title="Close viewer"
          aria-label="Close viewer"
        >
          <X className="w-5 h-5 stroke-[1.75]" />
        </button>
      </div>

      {/* Main Media Container */}
      <div
        className="max-w-4xl max-h-[85vh] flex flex-col items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {type === 'image' ? (
          <img
            src={src}
            alt={caption || fileName || 'Lightbox image'}
            className="max-w-full max-h-[75vh] object-contain rounded-card shadow-card select-none"
          />
        ) : (
          <video
            src={src}
            controls
            autoPlay
            className="max-w-full max-h-[75vh] rounded-card shadow-card"
          />
        )}

        {caption && (
          <div className="mt-3 px-4 py-2 rounded-card bg-surface/90 text-text-main text-sm max-w-xl text-center shadow-subtle">
            {caption}
          </div>
        )}
      </div>
    </div>
  );
};
