"use client";

import { Download, Pause, Play } from "lucide-react";
import {
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  /** Names the seek control that replaces the slider when `waveform` is on. */
  seekLabel?: string;
  src?: string | null;
  variant?: "default" | "hidden";
  /** Draws the recording's loudness as bars the listener can click to seek. Decodes the whole recording on mount. */
  waveform?: boolean;
};

const WAVEFORM_BARS = 120;
const SEEK_STEP_SECONDS = 5;

/** The loudest sample in each of `count` equal slices of the recording, across all channels, scaled so the loudest slice is 1. Null when the buffer can't be read. */
function computePeaks(buffer: { getChannelData?: (channel: number) => Float32Array; length?: number; numberOfChannels: number }, count: number): number[] | null {
  const length = buffer.length ?? 0;
  if (typeof buffer.getChannelData !== "function" || length <= 0) return null;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData!(channel));
  const peaks = new Array<number>(count).fill(0);
  const sliceLength = length / count;
  for (let bar = 0; bar < count; bar += 1) {
    const start = Math.floor(bar * sliceLength);
    const end = Math.max(start + 1, Math.floor((bar + 1) * sliceLength));
    let peak = 0;
    for (const data of channels) {
      for (let index = start; index < end && index < length; index += 1) {
        const value = Math.abs(data[index] ?? 0);
        if (value > peak) peak = value;
      }
    }
    peaks[bar] = peak;
  }
  const loudest = Math.max(...peaks);
  return loudest > 0 ? peaks.map((peak) => peak / loudest) : null;
}

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
  seekLabel,
  src,
  variant = "default",
  waveform = false,
}: CallRecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onEndedRef = useRef(onEnded);
  const processedUrlRef = useRef<string | null>(null);
  const preparingPlaybackSrcRef = useRef<Promise<string | null> | null>(null);
  const preparedForSrcRef = useRef<string | null>(null);
  const playOnLoadRef = useRef(false);
  // Bumped on every src change so a download still running for an older src never sets state.
  const generationRef = useRef(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(normalizeDurationSeconds(initialDurationSeconds));
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSrc, setPlaybackSrc] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  // Set once decoding ends without peaks, so the slider takes over instead of a placeholder that never fills.
  const [peaksFailed, setPeaksFailed] = useState(false);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (processedUrlRef.current) {
      URL.revokeObjectURL(processedUrlRef.current);
      processedUrlRef.current = null;
    }
    generationRef.current += 1;
    preparingPlaybackSrcRef.current = null;
    preparedForSrcRef.current = null;
    playOnLoadRef.current = false;
    setPlaybackSrc(null);
    setPeaks(null);
    setPeaksFailed(false);
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

    const generation = generationRef.current;
    const stale = () => generation !== generationRef.current;
    const promise = (async () => {
      const AudioContextCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextCtor) {
        setPeaksFailed(true);
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
          if (stale()) {
            return null;
          }

          if (waveform) {
            const nextPeaks = computePeaks(audioBuffer, WAVEFORM_BARS);
            setPeaks(nextPeaks);
            setPeaksFailed(nextPeaks === null);
          }

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
        if (stale()) {
          return null;
        }
        setPeaksFailed(true);
        preparedForSrcRef.current = src;
        setPlaybackSrc(src);
        return src;
      } finally {
        if (!stale()) {
          preparingPlaybackSrcRef.current = null;
        }
      }
    })();

    preparingPlaybackSrcRef.current = promise;
    return await promise;
  }

  useEffect(() => {
    if (!waveform || !src || playbackSrc) {
      return;
    }

    void ensurePlaybackSource();
  }, [playbackSrc, src, waveform]);

  useEffect(() => {
    if (!autoPlay || !src || playbackSrc) {
      return;
    }

    playOnLoadRef.current = true;
    void ensurePlaybackSource();
  }, [autoPlay, playbackSrc, src]);

  useEffect(() => {
    setCurrentTime(0);
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

  // Space plays and pauses from anywhere on the page, the way a video player does, unless it belongs to something else: a field, a button, a menu or a dialog.
  const togglePlaybackRef = useRef(togglePlayback);
  togglePlaybackRef.current = togglePlayback;
  useEffect(() => {
    if (!waveform || variant === "hidden") {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== " " || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, button, a[href], [contenteditable]:not([contenteditable='false']), [role='button'], [role='tab'], [role='combobox'], [role='menuitem'], [role='option'], [role='switch'], [role='checkbox'], [role='radio'], [role='dialog'], [role='alertdialog']")) {
        return;
      }

      event.preventDefault();
      void togglePlaybackRef.current();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [variant, waveform]);

  function seekTo(nextTime: number) {
    const audio = audioRef.current;
    if (!audio || duration <= 0) {
      return;
    }

    const clamped = Math.min(duration, Math.max(0, nextTime));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
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

        {waveform && !peaksFailed ? (
          peaks ? (
            <Waveform
              currentTime={currentTime}
              duration={duration}
              label={seekLabel ?? "Seek"}
              onSeek={seekTo}
              onToggle={() => void togglePlayback()}
              peaks={peaks}
            />
          ) : (
            <Skeleton aria-hidden="true" className="h-10 min-w-24 flex-1" />
          )
        ) : (
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
        )}

        <time className="min-w-10 text-right text-sm tabular-nums text-muted-foreground">
          {formatDuration(displayedRemainingSeconds)}
        </time>

        <a
          aria-label={downloadLabel}
          className={cn(buttonVariants({ size: "icon-sm", variant: "ghost" }), "size-8 rounded-md")}
          download
          href={src ?? undefined}
          rel="noopener noreferrer"
          target="_blank"
          title={downloadLabel}
        >
          <Download />
        </a>
      </div>
    </div>
  );
}

function Waveform({ currentTime, duration, label, onSeek, onToggle, peaks }: {
  currentTime: number;
  duration: number;
  label: string;
  onSeek: (seconds: number) => void;
  onToggle: () => void;
  peaks: number[];
}) {
  const ratio = duration > 0 ? currentTime / duration : 0;

  function seekFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || duration <= 0) {
      return;
    }

    onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * duration);
  }

  return (
    <div
      aria-label={label}
      aria-valuemax={Math.round(duration)}
      aria-valuemin={0}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={`${formatDuration(currentTime)} / ${formatDuration(duration)}`}
      className="flex h-10 min-w-24 flex-1 cursor-pointer touch-none items-center gap-px rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      onKeyDown={(event) => {
        if (event.key === " " && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          onToggle();
          return;
        }
        const step = event.key === "ArrowRight" || event.key === "ArrowUp" ? SEEK_STEP_SECONDS : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -SEEK_STEP_SECONDS : 0;
        if (step !== 0) {
          event.preventDefault();
          onSeek(currentTime + step);
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          onSeek(event.key === "Home" ? 0 : duration);
        }
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        seekFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) {
          seekFromPointer(event);
        }
      }}
      role="slider"
      tabIndex={0}
    >
      {peaks.map((peak, index) => (
        <span
          aria-hidden="true"
          className={cn("min-w-px flex-1 rounded-full", (index + 0.5) / peaks.length <= ratio ? "bg-foreground" : "bg-muted-foreground/35")}
          key={index}
          style={{ height: `${Math.max(10, peak * 100)}%` }}
        />
      ))}
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
