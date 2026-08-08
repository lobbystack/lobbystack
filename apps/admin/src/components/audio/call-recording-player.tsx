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
  onEnded?: () => void;
  pauseLabel: string;
  playLabel: string;
  src?: string | null;
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
  onEnded,
  pauseLabel,
  playLabel,
  src,
  variant = "default",
}: CallRecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onEndedRef = useRef(onEnded);
  const processedUrlRef = useRef<string | null>(null);
  const preparingPlaybackSrcRef = useRef<Promise<string | null> | null>(null);
  const preparedForSrcRef = useRef<string | null>(null);
  const playOnLoadRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(normalizeDurationSeconds(initialDurationSeconds));
  const [bufferedTime, setBufferedTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [playbackSrc, setPlaybackSrc] = useState<string | null>(null);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (processedUrlRef.current) {
      URL.revokeObjectURL(processedUrlRef.current);
      processedUrlRef.current = null;
    }
    preparingPlaybackSrcRef.current = null;
    preparedForSrcRef.current = null;
    playOnLoadRef.current = false;
    setPlaybackSrc(null);
  }, [src]);

  async function ensurePlaybackSource(): Promise<string | null> {
    if (!src) {
      return null;
    }

    if (preparedForSrcRef.current === src && playbackSrc) {
      return playbackSrc;
    }

    if (preparingPlaybackSrcRef.current) {
      return await preparingPlaybackSrcRef.current;
    }

    const promise = (async () => {
      const AudioContextCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextCtor) {
        preparedForSrcRef.current = src;
        setPlaybackSrc(src);
        return src;
      }

      try {
        const response = await fetch(src, { mode: "cors" });
        if (!response.ok) {
          throw new Error(`Failed to fetch recording: ${response.status}`);
        }

        const inputBuffer = await response.arrayBuffer();
        const decodeContext = new AudioContextCtor();

        try {
          const audioBuffer = await decodeContext.decodeAudioData(inputBuffer.slice(0));

          if (audioBuffer.numberOfChannels < 2) {
            preparedForSrcRef.current = src;
            setPlaybackSrc(src);
            return src;
          }

          const left = audioBuffer.getChannelData(0);
          const right = audioBuffer.getChannelData(1);
          const mixedLeft = new Float32Array(audioBuffer.length);
          const mixedRight = new Float32Array(audioBuffer.length);

          for (let index = 0; index < audioBuffer.length; index += 1) {
            const sample = ((left[index] ?? 0) + (right[index] ?? 0)) * 0.5;
            mixedLeft[index] = sample;
            mixedRight[index] = sample;
          }

          const wavBytes = encodeAudioBufferAsWav({
            channels: [mixedLeft, mixedRight],
            sampleRate: audioBuffer.sampleRate,
          });
          const nextPlaybackUrl = URL.createObjectURL(
            new Blob([wavBytes], { type: "audio/wav" }),
          );

          if (processedUrlRef.current) {
            URL.revokeObjectURL(processedUrlRef.current);
          }
          processedUrlRef.current = nextPlaybackUrl;
          preparedForSrcRef.current = src;
          setPlaybackSrc(nextPlaybackUrl);
          return nextPlaybackUrl;
        } finally {
          void decodeContext.close();
        }
      } catch {
        preparedForSrcRef.current = src;
        setPlaybackSrc(src);
        return src;
      } finally {
        preparingPlaybackSrcRef.current = null;
      }
    })();

    preparingPlaybackSrcRef.current = promise;
    return await promise;
  }

  useEffect(() => {
    if (!autoPlay || !src || playbackSrc) {
      return;
    }

    playOnLoadRef.current = true;
    void ensurePlaybackSource();
  }, [autoPlay, playbackSrc, src]);

  useEffect(() => {
    setCurrentTime(0);
    setBufferedTime(0);
    setDuration(normalizeDurationSeconds(initialDurationSeconds));
    setIsPlaying(false);

    if (!playbackSrc) {
      audioRef.current = null;
      return;
    }

    const audio = new Audio();
    audio.preload = "auto";
    audio.src = playbackSrc;
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
      onEndedRef.current?.();
    }

    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("timeupdate", updateCurrentTime);
    audio.addEventListener("progress", updateBufferedTime);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    if (autoPlay || playOnLoadRef.current) {
      playOnLoadRef.current = false;
      audio.currentTime = 0;
      void (async () => {
        try {
          await audio.play();
        } catch {
          setIsPlaying(false);
        }
      })();
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
  }, [initialDurationSeconds, playbackSrc, autoPlay]);

  // We explicitly expose togglePlayback for external control if needed.
  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      if (!src) {
        return;
      }

      playOnLoadRef.current = true;
      await ensurePlaybackSource();
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
      link.href = src ?? "";
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

function encodeAudioBufferAsWav(input: {
  channels: Array<Float32Array>;
  sampleRate: number;
}): ArrayBuffer {
  const channels = input.channels;
  const channelCount = channels.length;
  const frameCount = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = input.sampleRate * blockAlign;
  const dataByteLength = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, input.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = channels[channelIndex]?.[frameIndex] ?? 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      const pcm = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      view.setInt16(offset, pcm, true);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
