import { useEffect, useRef } from "react";
import { Mic, Phone, PhoneOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useWebVoiceCall,
  type WebVoiceErrorKey,
  type WebVoiceWidgetStatus,
} from "@/components/web-voice/useWebVoiceCall";
import type { TelemetryEventName } from "@lobbystack/telemetry";

function makeNoise() {
  const size = 256;
  const p = Array.from({ length: size }, (_, i) => i);
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = p[i]!;
    p[i] = p[j]!;
    p[j] = current;
  }
  return { p, size };
}

const noise = makeNoise();

function noise1D(x: number): number {
  const X = Math.floor(x) & (noise.size - 1);
  const xf = x - Math.floor(x);
  const u = xf * xf * (3 - 2 * xf);
  const a = noise.p[X] ?? 0;
  const b = noise.p[(X + 1) & (noise.size - 1)] ?? 0;
  return a + u * (b - a);
}

type AuraVoiceDemoProps = {
  businessSlug: string;
  endpoint: string;
  widgetId?: string;
  onEvent?: (
    eventName: TelemetryEventName,
    properties?: Record<string, unknown>,
  ) => void;
  onRegisterControls?: (controls: { forceEndCall: () => Promise<void> }) => void;
};

function getButtonLabelKey(
  status: WebVoiceWidgetStatus,
  muted: boolean,
): string {
  if (status === "connected") {
    return muted
      ? "testCall.aria.endMuted"
      : "testCall.aria.end";
  }
  if (status === "ending") {
    return "testCall.aria.ending";
  }
  if (status === "requesting_microphone") {
    return "testCall.aria.waitingForMicrophone";
  }
  if (status === "connecting") {
    return "testCall.aria.connecting";
  }
  if (status === "error") {
    return "testCall.aria.retry";
  }
  return "testCall.aria.start";
}

function getStatusLabelKey(status: WebVoiceWidgetStatus): string {
  return `testCall.status.${status}`;
}

function getErrorLabelKey(errorKey: WebVoiceErrorKey): string {
  return `testCall.errors.${errorKey}`;
}

export function AuraVoiceDemo({
  businessSlug,
  endpoint,
  widgetId,
  onEvent,
  onRegisterControls,
}: AuraVoiceDemoProps) {
  const { t } = useTranslation("common");
  const {
    status,
    muted,
    errorKey,
    remoteAudioRef,
    remoteStream,
    startCall,
    endCall,
    forceEndCall,
    isCallActive,
    isBusy,
  } = useWebVoiceCall({
    businessSlug,
    endpoint,
    ...(widgetId ? { widgetId } : {}),
    ...(onEvent ? { onEvent } : {}),
  });

  useEffect(() => {
    onRegisterControls?.({ forceEndCall });
  }, [forceEndCall, onRegisterControls]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const idleTimerRef = useRef<number | undefined>(undefined);
  const sizeRef = useRef({ width: 0, height: 0 });
  const visibleRef = useRef(true);
  const isActiveRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioLevelRef = useRef(0);

  const isListening = status === "connected" || status === "connecting";
  const isActive = isListening;
  const statusMessage = errorKey
    ? t(getErrorLabelKey(errorKey))
    : t(getStatusLabelKey(status));

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!remoteStream) {
      analyserRef.current = null;
      audioDataRef.current = null;
      audioLevelRef.current = 0;
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(remoteStream);
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    analyserRef.current = analyser;
    audioDataRef.current = new Uint8Array(analyser.frequencyBinCount);

    void audioContext.resume().catch(() => undefined);

    return () => {
      source.disconnect();
      analyser.disconnect();
      analyserRef.current = null;
      audioDataRef.current = null;
      audioLevelRef.current = 0;
      void audioContext.close().catch(() => undefined);
    };
  }, [remoteStream]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const updateSize = () => {
      const rect = wrap.getBoundingClientRect();
      sizeRef.current = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(wrap);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry?.isIntersecting ?? true;
    });
    intersectionObserver.observe(wrap);

    const scheduleNextFrame = () => {
      const delay = visibleRef.current ? 0 : 1000;

      if (delay === 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      idleTimerRef.current = window.setTimeout(() => {
        rafRef.current = requestAnimationFrame(draw);
      }, delay);
    };

    function draw(time: number) {
      const active = isActiveRef.current;
      const analyser = analyserRef.current;
      const audioData = audioDataRef.current;
      const c = canvas!;
      const cx = c.getContext("2d")!;

      if (analyser && audioData) {
        analyser.getByteTimeDomainData(audioData);
        let sum = 0;

        for (let i = 0; i < audioData.length; i++) {
          const sample = audioData[i] ?? 128;
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }

        const rms = Math.sqrt(sum / audioData.length);
        const targetLevel = Math.min(1, Math.max(0, (rms - 0.018) * 4));
        const previousLevel = audioLevelRef.current;
        const smoothing = targetLevel > previousLevel ? 0.18 : 0.06;
        audioLevelRef.current =
          previousLevel + (targetLevel - previousLevel) * smoothing;
      } else {
        audioLevelRef.current *= 0.9;
      }

      const voiceLevel = Math.pow(audioLevelRef.current, 0.85);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = sizeRef.current;

      if (width === 0 || height === 0) {
        scheduleNextFrame();
        return;
      }

      if (
        c.width !== Math.round(width * dpr) ||
        c.height !== Math.round(height * dpr)
      ) {
        c.width = Math.round(width * dpr);
        c.height = Math.round(height * dpr);
      }
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) / 2;

      cx.globalCompositeOperation = "source-over";
      cx.clearRect(0, 0, width, height);
      cx.globalCompositeOperation = "lighter";

      const t = time * 0.001;
      const pulseSpeed = active ? 1.1 + voiceLevel * 0.9 : 0.7;
      const layers = active ? 5 : 4;

      for (let layer = 0; layer < layers; layer++) {
        const layerOffset = layer * 1.7;
        const phase = t * pulseSpeed + layerOffset;
        const breathe = Math.sin(phase) * 0.5 + 0.5;

        const voiceExpansion = voiceLevel * 0.018;
        const innerR =
          baseRadius * (0.18 + layer * 0.1 + breathe * 0.035 + voiceExpansion);
        const outerR =
          baseRadius * (0.28 + layer * 0.12 + breathe * 0.05 + voiceExpansion);

        const distortion = active ? 8 : 6;
        const points = 120;
        cx.beginPath();

        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const n = noise1D(angle * 3 + t * 0.5 + layer * 10) / noise.size;
          const r = innerR + (outerR - innerR) * (0.5 + n * 0.5);
          const dx =
            Math.cos(angle) * (r + Math.sin(angle * 5 + t + layer) * distortion);
          const dy =
            Math.sin(angle) * (r + Math.cos(angle * 5 + t + layer) * distortion);

          if (i === 0) {
            cx.moveTo(centerX + dx, centerY + dy);
          } else {
            cx.lineTo(centerX + dx, centerY + dy);
          }
        }

        cx.closePath();

        const baseOpacity = active ? 0.11 - layer * 0.014 : 0.1 - layer * 0.012;
        const opacityPulse =
          baseOpacity + (active ? breathe * 0.03 + voiceLevel * 0.045 : 0);
        const alpha = Math.max(0, opacityPulse);

        const gradient = cx.createRadialGradient(
          centerX,
          centerY,
          innerR * 0.5,
          centerX,
          centerY,
          outerR * 1.2,
        );
        gradient.addColorStop(0, `rgba(0,0,0,${alpha * 0.3})`);
        gradient.addColorStop(0.4, `rgba(0,0,0,${alpha * 0.8})`);
        gradient.addColorStop(0.7, `rgba(0,0,0,${alpha * 0.5})`);
        gradient.addColorStop(1, "rgba(0,0,0,0)");

        cx.fillStyle = gradient;
        cx.fill();

        const strokeAlpha = active
          ? 0.07 + breathe * 0.025 + voiceLevel * 0.025
          : 0.06;
        cx.strokeStyle = `rgba(0,0,0,${strokeAlpha})`;
        cx.lineWidth = 1;
        cx.stroke();
      }

      const glowRadius =
        baseRadius *
        (0.15 + (active ? Math.sin(t * 3) * 0.018 + voiceLevel * 0.03 : 0));
      const glowGrad = cx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        glowRadius * 2,
      );
      const glowAlpha = active
        ? 0.05 + Math.sin(t * 2.5) * 0.018 + voiceLevel * 0.045
        : 0.05;
      glowGrad.addColorStop(0, `rgba(0,0,0,${glowAlpha})`);
      glowGrad.addColorStop(0.5, `rgba(0,0,0,${glowAlpha * 0.5})`);
      glowGrad.addColorStop(1, "rgba(0,0,0,0)");
      cx.fillStyle = glowGrad;
      cx.fillRect(0, 0, width, height);

      cx.globalCompositeOperation = "source-over";

      scheduleNextFrame();
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, []);

  return (
    <div className="mx-auto flex w-full min-w-0 flex-col items-center text-center">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div
        ref={wrapRef}
        className={cn(
          "relative flex aspect-square w-full max-w-sm items-center justify-center",
          isBusy && "cursor-wait",
        )}
      >
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        />

        <div
          className={cn(
            "voice-aura-outer-ring pointer-events-none absolute rounded-full",
            "transition-opacity duration-700",
            isActive
              ? "voice-aura-outer-ring-active opacity-100"
              : "opacity-30",
          )}
        />

        <p className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </p>

        <button
          type="button"
          onClick={isCallActive ? endCall : startCall}
          disabled={isBusy || status === "ending"}
          aria-label={t(getButtonLabelKey(status, muted))}
          className={cn(
            "voice-aura-button relative z-10 flex aspect-square w-36 items-center justify-center rounded-full",
            "transition-all duration-300 ease-out",
            "cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
            !isCallActive && !isBusy && "hover:scale-110 active:scale-95",
            isActive && "scale-105",
          )}
        >
          <div className="voice-aura-button-highlight absolute inset-px rounded-full" />

          {isActive ? (
            <span className="absolute inset-[-20px] animate-pulse rounded-full border border-foreground/15" />
          ) : null}

          {isActive ? (
            <Mic
              className="relative z-10 size-12 text-white"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          ) : (
            <Phone
              className="relative z-10 size-12 text-white"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          )}
        </button>

        {status === "connecting" ? (
          <div className="absolute inset-x-0 top-1/2 z-20 mt-32 flex items-center justify-center">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled
              className="rounded-full"
            >
              {t("testCall.connecting")}
            </Button>
          </div>
        ) : isCallActive ? (
          <div className="absolute inset-x-0 top-1/2 z-20 mt-32 flex items-center justify-center">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={endCall}
              className="cursor-pointer rounded-full"
            >
              <PhoneOff className="size-4" aria-hidden="true" />
              {t("testCall.hangUp")}
            </Button>
          </div>
        ) : null}
      </div>

      {errorKey ? (
        <p className="mt-4 max-w-sm text-sm text-destructive">{statusMessage}</p>
      ) : null}
    </div>
  );
}
