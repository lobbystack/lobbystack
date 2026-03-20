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
  className?: string;
  downloadLabel: string;
  initialDurationSeconds?: number;
  pauseLabel: string;
  playLabel: string;
  src: string;
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

  return Math.ceil(seconds);
}

export function CallRecordingPlayer({
  className,
  downloadLabel,
  initialDurationSeconds = 0,
  pauseLabel,
  playLabel,
  src,
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

    const audio = new Audio(src);
    audio.preload = "none";
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
      setDuration((currentDuration) =>
        Math.max(currentDuration, normalizeDurationSeconds(audio.duration || 0))
      );
    }

    function updateCurrentTime() {
      setCurrentTime(audio.currentTime);
    }

    function handlePlay() {
      setIsPlaying(true);
    }

    function handlePause() {
      setIsPlaying(false);
    }

    function handleEnded() {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
    }

    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("timeupdate", updateCurrentTime);
    audio.addEventListener("progress", updateBufferedTime);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

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
  }, [initialDurationSeconds, src]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      try {
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
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const extension = blob.type.includes("mpeg")
        ? "mp3"
        : blob.type.includes("wav")
          ? "wav"
          : blob.type.includes("ogg")
            ? "ogg"
            : "audio";

      link.href = objectUrl;
      link.download = `call-recording.${extension}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } finally {
      setIsDownloading(false);
    }
  }

  const progress = useMemo(() => {
    if (duration <= 0) {
      return 0;
    }
    return (currentTime / duration) * 100;
  }, [currentTime, duration]);

  const bufferedProgress = useMemo(() => {
    if (duration <= 0) {
      return 0;
    }
    return (bufferedTime / duration) * 100;
  }, [bufferedTime, duration]);

  const displayedRemainingSeconds = useMemo(() => {
    if (duration <= 0) {
      return 0;
    }

    return Math.max(0, Math.ceil(duration - currentTime));
  }, [currentTime, duration]);

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
          bufferValue={bufferedProgress}
          className="min-w-24 flex-1"
          max={100}
          min={0}
          onValueChange={(value) => {
            const nextValue = value[0];
            if (nextValue === undefined || duration <= 0) {
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
