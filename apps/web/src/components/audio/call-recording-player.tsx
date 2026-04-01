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

  return seconds;
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
  const audioContextRef = useRef<AudioContext | null>(null);
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
    audio.crossOrigin = "anonymous";
    audio.src = src;
    audioRef.current = audio;

    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      try {
        const audioContext = new AudioContextCtor();
        const source = audioContext.createMediaElementSource(audio);
        const splitter = audioContext.createChannelSplitter(2);
        const merger = audioContext.createChannelMerger(2);
        const inboundToLeft = audioContext.createGain();
        const inboundToRight = audioContext.createGain();
        const outboundToLeft = audioContext.createGain();
        const outboundToRight = audioContext.createGain();

        inboundToLeft.gain.value = 0.5;
        inboundToRight.gain.value = 0.5;
        outboundToLeft.gain.value = 0.5;
        outboundToRight.gain.value = 0.5;

        source.connect(splitter);
        splitter.connect(inboundToLeft, 0);
        splitter.connect(inboundToRight, 0);
        splitter.connect(outboundToLeft, 1);
        splitter.connect(outboundToRight, 1);
        inboundToLeft.connect(merger, 0, 0);
        outboundToLeft.connect(merger, 0, 0);
        inboundToRight.connect(merger, 0, 1);
        outboundToRight.connect(merger, 0, 1);
        merger.connect(audioContext.destination);

        audioContextRef.current = audioContext;
      } catch {
        audioContextRef.current = null;
      }
    }

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
      const audioContext = audioContextRef.current;
      audioContextRef.current = null;
      void audioContext?.close();
    };
  }, [initialDurationSeconds, src]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      try {
        if (audioContextRef.current?.state === "suspended") {
          await audioContextRef.current.resume();
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
    return (currentTime / duration) * 100;
  }, [currentTime, duration]);

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
          className="min-w-24 flex-1"
          max={100}
          min={0}
          onValueChange={(value) => {
            if (typeof value !== "number" || duration <= 0) {
              return;
            }

            const audio = audioRef.current;
            if (!audio) {
              return;
            }

            const nextTime = (value / 100) * duration;
            audio.currentTime = nextTime;
            setCurrentTime(nextTime);
          }}
          value={progress}
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
