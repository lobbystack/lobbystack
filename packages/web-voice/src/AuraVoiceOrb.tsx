import { useEffect, useRef, type ReactNode } from "react";
import { Mic, Phone } from "lucide-react";

import type { WebVoiceCall } from "./useWebVoiceCall";

// Simple 1D noise for organic distortion.
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

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export type AuraTone = "light" | "dark";

const WAVE_RGB: Record<AuraTone, string> = {
  light: "0,0,0",
  dark: "255,255,255",
};

const AURA_WAVE_STYLE = {
  light: {
    fillStops: [0.3, 0.8, 0.5] as const,
    baseOpacity: { active: 0.11, idle: 0.1 },
    layerDecay: { active: 0.014, idle: 0.012 },
    stroke: { active: 0.07, idle: 0.06 },
    strokePulse: { breathe: 0.025, voice: 0.025 },
    glow: 0.05,
    pulseBoost: 0.03,
    voiceBoost: 0.045,
  },
  dark: {
    fillStops: [0.5, 1, 0.75] as const,
    baseOpacity: { active: 0.22, idle: 0.2 },
    layerDecay: { active: 0.02, idle: 0.018 },
    stroke: { active: 0.16, idle: 0.14 },
    strokePulse: { breathe: 0.04, voice: 0.04 },
    glow: 0.1,
    pulseBoost: 0.045,
    voiceBoost: 0.06,
  },
} satisfies Record<
  AuraTone,
  {
    fillStops: readonly [number, number, number];
    baseOpacity: { active: number; idle: number };
    layerDecay: { active: number; idle: number };
    stroke: { active: number; idle: number };
    strokePulse: { breathe: number; voice: number };
    glow: number;
    pulseBoost: number;
    voiceBoost: number;
  }
>;

// How the round button moves on hover and press. "subtle" is the landing
// site's tighter motion, which relies on its --ease-out token.
const PRESS_MOTION = {
  pop: { transition: "transition-all duration-300 ease-out", press: "hover:scale-110 active:scale-95" },
  subtle: {
    transition: "transition-[scale,opacity] duration-200 ease-(--ease-out)",
    press: "hover:scale-[1.03] active:scale-[0.97]",
  },
};

type AuraVoiceOrbProps = {
  call: WebVoiceCall;
  /** Text for the polite live region that announces the call status. */
  statusLabel: string;
  /** Accessible name of the round call button. */
  buttonLabel: string;
  auraTone?: AuraTone;
  pressMotion?: keyof typeof PRESS_MOTION;
  /** Controls placed over the aura, such as a hang-up pill. */
  children?: ReactNode;
};

/**
 * The animated aura and round call button. The aura breathes while idle and
 * follows the receptionist's voice during a call.
 */
export function AuraVoiceOrb({
  call,
  statusLabel,
  buttonLabel,
  auraTone = "light",
  pressMotion = "pop",
  children,
}: AuraVoiceOrbProps) {
  const { status, remoteAudioRef, remoteStream, startCall, endCall, isCallActive, isBusy } = call;
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
  const animTimeRef = useRef(0);
  const lastFrameTimeRef = useRef<number | undefined>(undefined);

  const isActive = status === "connected" || status === "connecting";
  const motion = PRESS_MOTION[pressMotion];

  // Keep the ref in sync so the animation loop reads the latest state.
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
        lastFrameTimeRef.current = undefined;
        rafRef.current = requestAnimationFrame(draw);
      }, delay);
    };

    const waveRgb = WAVE_RGB[auraTone];
    const waveStyle = AURA_WAVE_STYLE[auraTone];

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
        audioLevelRef.current = previousLevel + (targetLevel - previousLevel) * smoothing;
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

      if (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr)) {
        c.width = Math.round(width * dpr);
        c.height = Math.round(height * dpr);
      }
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) / 2;

      // Additive blending for the glow.
      cx.globalCompositeOperation = "source-over";
      cx.clearRect(0, 0, width, height);
      cx.globalCompositeOperation = "lighter";

      const rawDt =
        lastFrameTimeRef.current === undefined ? 0 : (time - lastFrameTimeRef.current) * 0.001;
      lastFrameTimeRef.current = time;
      const dt = Math.min(rawDt, 1 / 30);
      animTimeRef.current += dt;
      const t = animTimeRef.current;
      const pulseSpeed = active ? 1.1 + voiceLevel * 0.9 : 0.7;
      const layers = active ? 5 : 4;

      for (let layer = 0; layer < layers; layer++) {
        const layerOffset = layer * 1.7;
        const phase = t * pulseSpeed + layerOffset;
        const breathe = Math.sin(phase) * 0.5 + 0.5;

        const voiceExpansion = voiceLevel * 0.018;
        const innerR = baseRadius * (0.18 + layer * 0.1 + breathe * 0.035 + voiceExpansion);
        const outerR = baseRadius * (0.28 + layer * 0.12 + breathe * 0.05 + voiceExpansion);

        // Keep the outline organic but stable; voice should breathe the aura, not deform it.
        const distortion = active ? 8 : 6;
        const points = 120;
        cx.beginPath();

        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const n = noise1D(angle * 3 + t * 0.5 + layer * 10) / noise.size;
          const r = innerR + (outerR - innerR) * (0.5 + n * 0.5);
          const dx = Math.cos(angle) * (r + Math.sin(angle * 5 + t + layer) * distortion);
          const dy = Math.sin(angle) * (r + Math.cos(angle * 5 + t + layer) * distortion);

          if (i === 0) {
            cx.moveTo(centerX + dx, centerY + dy);
          } else {
            cx.lineTo(centerX + dx, centerY + dy);
          }
        }

        cx.closePath();

        // Opacity varies with energy and layer depth.
        const baseOpacity = active
          ? waveStyle.baseOpacity.active - layer * waveStyle.layerDecay.active
          : waveStyle.baseOpacity.idle - layer * waveStyle.layerDecay.idle;
        const opacityPulse =
          baseOpacity +
          (active ? breathe * waveStyle.pulseBoost + voiceLevel * waveStyle.voiceBoost : 0);
        const alpha = Math.max(0, opacityPulse);

        const gradient = cx.createRadialGradient(
          centerX,
          centerY,
          innerR * 0.5,
          centerX,
          centerY,
          outerR * 1.2,
        );
        const [fillInner, fillMid, fillOuter] = waveStyle.fillStops;
        gradient.addColorStop(0, `rgba(${waveRgb},${alpha * fillInner})`);
        gradient.addColorStop(0.4, `rgba(${waveRgb},${alpha * fillMid})`);
        gradient.addColorStop(0.7, `rgba(${waveRgb},${alpha * fillOuter})`);
        gradient.addColorStop(1, `rgba(${waveRgb},0)`);

        cx.fillStyle = gradient;
        cx.fill();

        // Thin stroke ring for structure.
        const strokeAlpha = active
          ? waveStyle.stroke.active +
            breathe * waveStyle.strokePulse.breathe +
            voiceLevel * waveStyle.strokePulse.voice
          : waveStyle.stroke.idle;
        cx.strokeStyle = `rgba(${waveRgb},${strokeAlpha})`;
        cx.lineWidth = 1;
        cx.stroke();
      }

      // Central glow pulse.
      const glowRadius =
        baseRadius * (0.15 + (active ? Math.sin(t * 3) * 0.018 + voiceLevel * 0.03 : 0));
      const glowGrad = cx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius * 2);
      const glowAlpha = active
        ? waveStyle.glow + Math.sin(t * 2.5) * 0.02 + voiceLevel * waveStyle.voiceBoost
        : waveStyle.glow;
      glowGrad.addColorStop(0, `rgba(${waveRgb},${glowAlpha})`);
      glowGrad.addColorStop(0.5, `rgba(${waveRgb},${glowAlpha * 0.5})`);
      glowGrad.addColorStop(1, `rgba(${waveRgb},0)`);
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
  }, [auraTone]);

  return (
    <>
      {/* A live WebRTC stream, so there is nothing to caption. */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div
        ref={wrapRef}
        className={classNames(
          "relative flex aspect-square w-full items-center justify-center",
          isBusy && "cursor-wait",
        )}
      >
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        />

        <div
          className={classNames(
            "voice-aura-outer-ring pointer-events-none absolute rounded-full",
            auraTone === "dark" && "hidden",
            "transition-opacity duration-700",
            isActive ? "voice-aura-outer-ring-active opacity-100" : "opacity-30",
          )}
        />

        <p className="sr-only" role="status" aria-live="polite">
          {statusLabel}
        </p>

        <button
          type="button"
          onClick={isCallActive ? endCall : startCall}
          disabled={isBusy || status === "ending"}
          aria-label={buttonLabel}
          className={classNames(
            "voice-aura-button relative z-10 flex aspect-square w-36 items-center justify-center rounded-full",
            motion.transition,
            "cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
            !isCallActive && !isBusy && motion.press,
            isActive && "scale-105",
          )}
        >
          <div className="voice-aura-button-highlight absolute inset-px rounded-full" />

          {isActive && auraTone !== "dark" ? (
            <span className="absolute inset-[-20px] animate-pulse rounded-full border border-foreground/15" />
          ) : null}

          {isActive ? (
            <Mic className="relative z-10 size-12 text-white" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Phone className="relative z-10 size-12 text-white" strokeWidth={1.5} aria-hidden="true" />
          )}
        </button>

        {children}
      </div>
    </>
  );
}
