"use client";

import { Download, Pause, Play } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type CallRecordingPlayerProps = {
  autoPlay?: boolean;
  className?: string;
  downloadLabel: string;
  initialDurationSeconds?: number;
  pauseLabel: string;
  playLabel: string;
  src: string;
  variant?: "default" | "hidden";
};

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function normalizeDurationSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  return seconds;
}

export function CallRecordingPlayer({
  autoPlay,
  className,
  downloadLabel,
  initialDurationSeconds = 0,
  pauseLabel,
  playLabel,
  src,
  variant = "default",
}: CallRecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(normalizeDurationSeconds(initialDurationSeconds));
  const [bufferedTime, setBufferedTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    setCurrentTime(0);
    setBufferedTime(0);
    setDuration(normalizeDurationSeconds(initialDurationSeconds));
    setIsPlaying(false);

    const audio = new Audio();
    audio.preload = "none";
    audio.src = src;
    audioRef.current = audio;

    function updateBufferedTime() {
      const currentAudio = audioRef.current;
      if (!currentAudio || currentAudio.buffered.length === 0) {
        setBufferedTime(0);
        return;
      }

      const nextBufferedTime = currentAudio.buffered.end(currentAudio.buffered.length - 1);
      setBufferedTime(nextBufferedTime);
    }

    function updateDuration() {
      const nextDuration = normalizeDurationSeconds(audio.duration || 0);
      if (nextDuration > 0) {
        setDuration(nextDuration);
      }
    }

    function updateCurrentTime() {
      setCurrentTime(() => {
        const exactDuration = normalizeDurationSeconds(audio.duration || 0);
        if (exactDuration > 0 && audio.currentTime >= exactDuration - 0.05) {
          return exactDuration;
        }

        return audio.currentTime;
      });
    }

    function handlePlay() {
      setIsPlaying(true);
    }

    function handlePause() {
      setIsPlaying(false);
    }

    function handleEnded() {
      setIsPlaying(false);
      setCurrentTime((currentDuration) => {
        const endedAt = normalizeDurationSeconds(audio.duration || 0);
        return endedAt > 0 ? endedAt : currentDuration;
      });
    }

    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("timeupdate", updateCurrentTime);
    audio.addEventListener("progress", updateBufferedTime);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    if (autoPlay) {
      audio.currentTime = 0;
      void audio.play().catch(() => {
        setIsPlaying(false);
      });
    }

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("timeupdate", updateCurrentTime);
      audio.removeEventListener("progress", updateBufferedTime);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audioRef.current = null;
    };
  }, [initialDurationSeconds, src, autoPlay]);

  // We explicitly expose togglePlayback for external control if needed.
  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      try {
        const exactDuration = normalizeDurationSeconds(audio.duration || duration);
        if (exactDuration > 0 && audio.currentTime >= exactDuration - 0.05) {
          audio.currentTime = 0;
          setCurrentTime(0);
        }
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    audio.pause();
  }

  async function downloadAudio() {
    if (isDownloading) {
      return;
    }

    setIsDownloading(true);

    try {
      const link = document.createElement("a");
      link.href = src;
      link.download = "";
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      document.body.append(link);
      link.click();
      link.remove();
    } finally {
      setIsDownloading(false);
    }
  }

  const progress = useMemo(() => {
    if (duration <= 0) {
      return 0;
    }
    return Math.min(100, (currentTime / duration) * 100);
  }, [currentTime, duration]);

  const displayedRemainingSeconds = useMemo(() => {
    if (duration <= 0) {
      return 0;
    }

    const remainingSeconds = duration - currentTime;
    if (remainingSeconds <= 0.05) {
      return 0;
    }

    return Math.max(0, Math.ceil(remainingSeconds));
  }, [currentTime, duration]);

  if (variant === "hidden") {
    return null;
  }

  return (
    <div
      className={cn(
        "w-full px-2 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Button
          aria-label={isPlaying ? pauseLabel : playLabel}
          className="size-8 rounded-md"
          onClick={() => void togglePlayback()}
          size="icon-sm"
          title={isPlaying ? pauseLabel : playLabel}
          variant="ghost"
        >
          {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </Button>

        <Slider
          className="min-w-24 flex-1"
          max={100}
          min={0}
          onValueChange={(value) => {
            const nextValue = Array.isArray(value) ? value[0] : value;
            if (typeof nextValue !== "number" || duration <= 0) {
              return;
            }

            const audio = audioRef.current;
            if (!audio) {
              return;
            }

            const nextTime = (nextValue / 100) * duration;
            audio.currentTime = nextTime;
            setCurrentTime(nextTime);
          }}
          value={[progress]}
        />

        <time className="min-w-10 text-right text-sm tabular-nums text-muted-foreground">
          {formatDuration(displayedRemainingSeconds)}
        </time>

        <Button
          aria-label={downloadLabel}
          className="size-8 rounded-md"
          disabled={isDownloading}
          onClick={() => void downloadAudio()}
          size="icon-sm"
          title={downloadLabel}
          variant="ghost"
        >
          <Download />
        </Button>
      </div>
    </div>
  );
}
