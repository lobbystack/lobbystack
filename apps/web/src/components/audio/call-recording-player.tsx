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

export function CallRecordingPlayer({
  className,
  downloadLabel,
  pauseLabel,
  playLabel,
  src,
}: CallRecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const audio = new Audio(src);
    audio.preload = "metadata";
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
      setDuration(audio.duration || 0);
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
  }, [src]);

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

  return (
    <div
      className={cn(
        "w-full rounded-xl border border-border/80 bg-background/95 p-2 shadow-xs",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Button
          aria-label={isPlaying ? pauseLabel : playLabel}
          className="size-10 rounded-lg"
          onClick={() => void togglePlayback()}
          size="icon"
          title={isPlaying ? pauseLabel : playLabel}
          variant="secondary"
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

        <time className="min-w-12 px-1 text-right font-mono text-sm tabular-nums text-muted-foreground">
          {formatDuration(duration > 0 ? duration - currentTime : 0)}
        </time>

        <Button
          aria-label={downloadLabel}
          className="size-10 rounded-lg"
          render={<a download href={src} rel="noreferrer" target="_blank" />}
          size="icon"
          title={downloadLabel}
          variant="outline"
        >
          <Download />
        </Button>
      </div>
    </div>
  );
}
