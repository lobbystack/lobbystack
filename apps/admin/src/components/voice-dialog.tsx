"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Play, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { receptionistVoices, receptionistVoiceTraits, type ReceptionistVoice, type RuntimeLocale } from "@lobbystack/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Voice names are proper nouns, shown the same in every language.
export function voiceName(voice: ReceptionistVoice): string {
  return voice.charAt(0).toUpperCase() + voice.slice(1);
}

export function voicePreviewSrc(locale: RuntimeLocale, voice: ReceptionistVoice): string {
  return `/voice-previews/${locale}/${voice}.mp3`;
}

export function useVoiceTraits() {
  const { t } = useTranslation("agent");
  return (voice: ReceptionistVoice) => {
    const { pitch, pace } = receptionistVoiceTraits[voice];
    return t("fields.voice.traits", { pitch: t(`fields.voice.pitch.${pitch}`), pace: t(`fields.voice.pace.${pace}`) });
  };
}

export type VoicePreview = {
  playing: ReceptionistVoice | null;
  progress: number;
  /** Voices whose clip failed to play; the dialog hides their play button. */
  missing: ReadonlySet<ReceptionistVoice>;
  play: (voice: ReceptionistVoice) => void;
  /** Stops the clip playing and lets the browser free it. */
  stop: () => void;
};

type CurrentClip = { audio: HTMLAudioElement; listeners: AbortController };

/** One preview at a time: starting a voice stops the one before it. Each play loads its own clip. */
export function useVoicePreview(locale: RuntimeLocale): VoicePreview {
  const [playing, setPlaying] = useState<ReceptionistVoice | null>(null);
  const [progress, setProgress] = useState(0);
  // Clip URLs that failed, kept while the page is open so the voice doesn't offer a button that fails again.
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const clipRef = useRef<CurrentClip | null>(null);

  const stop = useCallback(() => {
    const clip = clipRef.current;
    clipRef.current = null;
    if (clip) {
      clip.listeners.abort();
      clip.audio.pause();
      clip.audio.removeAttribute("src");
      clip.audio.load();
    }
    setPlaying(null);
    setProgress(0);
  }, []);
  const play = useCallback((voice: ReceptionistVoice) => {
    stop();
    const src = voicePreviewSrc(locale, voice);
    const clip: CurrentClip = { audio: new Audio(src), listeners: new AbortController() };
    const { audio, listeners: { signal } } = clip;
    clipRef.current = clip;
    setPlaying(voice);
    // Stopping or starting another clip aborts this one's play(); only a failure of the clip playing counts.
    const fail = () => {
      if (clipRef.current !== clip) return;
      stop();
      setFailed((current) => new Set(current).add(src));
    };
    audio.addEventListener("timeupdate", () => { if (clipRef.current === clip && audio.duration) setProgress(audio.currentTime / audio.duration); }, { signal });
    audio.addEventListener("ended", () => { if (clipRef.current === clip) stop(); }, { signal });
    audio.addEventListener("error", fail, { signal });
    audio.play().catch(fail);
  }, [locale, stop]);

  const missing = useMemo(() => new Set(receptionistVoices.filter((voice) => failed.has(voicePreviewSrc(locale, voice)))), [failed, locale]);
  // A new language plays its own clips, and leaving the page frees the one playing.
  useEffect(() => stop, [locale, stop]);
  return { playing, progress, missing, play, stop };
}

const RING_RADIUS = 18;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** A round play button that becomes stop, with a thin ring that fills as the clip plays. */
export function VoicePlayButton({ voice, preview, className }: { voice: ReceptionistVoice; preview: VoicePreview; className?: string }) {
  const { t } = useTranslation("agent");
  // Keeps the name where it is in the list when a clip is missing.
  if (preview.missing.has(voice)) return <span aria-hidden="true" className="size-10 shrink-0" />;
  const active = preview.playing === voice;
  return (
    <button
      aria-label={t(active ? "fields.voice.stop" : "fields.voice.play", { voice: voiceName(voice) })}
      className={cn("relative flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors outline-none hover:bg-muted/70 focus-visible:ring-[3px] focus-visible:ring-ring/50", className)}
      onClick={(event) => { event.stopPropagation(); if (active) preview.stop(); else preview.play(voice); }}
      type="button"
    >
      {active ? <svg aria-hidden="true" className="absolute inset-0 size-full -rotate-90" data-testid="voice-progress" viewBox="0 0 40 40">
        <circle cx="20" cy="20" fill="none" r={RING_RADIUS} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1.5" />
        <circle cx="20" cy="20" fill="none" r={RING_RADIUS} stroke="currentColor" strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH * (1 - preview.progress)} strokeLinecap="round" strokeWidth="1.5" />
      </svg> : null}
      {active ? <Square aria-hidden="true" className="size-3.5 fill-current" /> : <Play aria-hidden="true" className="size-3.5 fill-current" />}
    </button>
  );
}

function VoiceRow({ voice, picked, inUse, preview, onPick }: { voice: ReceptionistVoice; picked: boolean; inUse?: boolean; preview: VoicePreview; onPick: () => void }) {
  const { t } = useTranslation("agent");
  const traits = useVoiceTraits();
  return (
    // The pick button stretches over the whole row; the play button sits above it and only plays.
    <li className={cn("relative flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/50 has-[button[aria-pressed]:focus-visible]:ring-[3px] has-[button[aria-pressed]:focus-visible]:ring-ring/50", picked && "bg-muted")}>
      <VoicePlayButton className="z-10" preview={preview} voice={voice} />
      <button aria-pressed={picked} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1 text-left outline-none after:absolute after:inset-0 after:rounded-xl" onClick={onPick} type="button">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2"><span className="truncate font-medium">{voiceName(voice)}</span>{inUse ? <Badge variant="secondary">{t("fields.voice.inUse")}</Badge> : null}</span>
          <span className="truncate text-sm text-muted-foreground">{traits(voice)}</span>
        </span>
        {picked ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
      </button>
    </li>
  );
}

/** Pick the receptionist's voice. Playing a clip never picks it; "Use this voice" saves. */
export function VoiceDialog({ open, onOpenChange, current, preview, saving, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: ReceptionistVoice;
  preview: VoicePreview;
  saving: boolean;
  onSave: (voice: ReceptionistVoice) => Promise<boolean>;
}) {
  const { t } = useTranslation("agent");
  const [picked, setPicked] = useState(current);
  const { stop } = preview;
  useEffect(() => { if (open) setPicked(current); }, [open, current]);
  // However the dialog closes, the clip stops with it.
  useEffect(() => { if (!open) stop(); }, [open, stop]);
  const close = (next: boolean) => { if (!next) stop(); onOpenChange(next); };

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle>{t("fields.voice.dialog.title")}</DialogTitle>
          <DialogDescription>{t("fields.voice.dialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="-mx-2 flex min-h-0 flex-col gap-4 overflow-y-auto px-2">
          <section aria-labelledby="voice-current" className="flex flex-col gap-1">
            <h3 className="px-2 text-xs font-medium text-muted-foreground" id="voice-current">{t("fields.voice.dialog.current")}</h3>
            <ul><VoiceRow inUse onPick={() => setPicked(current)} picked={picked === current} preview={preview} voice={current} /></ul>
          </section>
          <section aria-labelledby="voice-all" className="flex flex-col gap-1">
            <h3 className="px-2 text-xs font-medium text-muted-foreground" id="voice-all">{t("fields.voice.dialog.all")}</h3>
            <ul>{receptionistVoices.filter((voice) => voice !== current).map((voice) => <VoiceRow key={voice} onPick={() => setPicked(voice)} picked={picked === voice} preview={preview} voice={voice} />)}</ul>
          </section>
        </div>
        <DialogFooter>
          <Button onClick={() => close(false)} type="button" variant="outline">{t("fields.voice.dialog.cancel")}</Button>
          <Button disabled={picked === current || saving} onClick={() => { void onSave(picked).then((saved) => { if (saved) close(false); }); }} type="button">{t("fields.voice.dialog.use")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
