import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatAudioDuration } from '../../lib/formatters';

interface AudioPlayerProps {
  src?: string | null;
  durationSeconds?: number | null;
  isVoice?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  durationSeconds,
  isVoice = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(Math.round(audio.duration));
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const newTime = Number(e.target.value);
    if (audio) {
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  return (
    <div className="flex items-center gap-3 py-1 px-1 min-w-[220px] max-w-[280px]">
      {src && <audio ref={audioRef} src={src} preload="metadata" />}

      {/* Play / Pause button */}
      <button
        onClick={togglePlay}
        disabled={!src}
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors shadow-subtle',
          isVoice
            ? 'bg-accent text-white hover:bg-accent-hover'
            : 'bg-surface text-text-main border border-border-subtle hover:bg-surface-subtle',
          !src && 'opacity-50 cursor-not-allowed',
        )}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Progress & Waveform Bar */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <div className="relative w-full flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            disabled={!src}
            className="w-full h-1.5 bg-border-subtle rounded-full appearance-none cursor-pointer accent-accent outline-none"
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-text-muted">
          <span>{formatAudioDuration(currentTime)}</span>
          <div className="flex items-center gap-1">
            {isVoice && <Mic className="w-3 h-3 text-accent" />}
            <span>{formatAudioDuration(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
