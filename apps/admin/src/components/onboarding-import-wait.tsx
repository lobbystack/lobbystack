"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IMPORT_WAIT_SCENES } from "./onboarding-import-wait-scenes";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { isWebsiteImportRunning, type WebsiteImportSummary } from "./website-import-progress";

/**
 * Most imports still running when the operator reaches the wait finish within
 * this limit, and waiting longer catches almost none of the rest. Those few run
 * for minutes, so the operator moves on and they keep reading.
 */
export const IMPORT_WAIT_LIMIT_MS = 90_000;

const SLIDE_MS = 7_000;

const SLIDES = ["answers", "booking", "transfer", "languages", "summaries", "widget"] as const;

/** checking: no answer yet. waiting: the screen shows. waited: the screen showed and ended. ready: it never showed. */
export type ImportWaitPhase = "checking" | "waiting" | "waited" | "ready";

function nextPhase(phase: ImportWaitPhase, settled: boolean, running: boolean, justSubmitted: boolean): ImportWaitPhase {
  if (phase === "checking") return !settled ? phase : running ? "waiting" : "ready";
  // A just-submitted website also holds while the import is still on its way.
  if (phase === "waiting") return running || (justSubmitted && !settled) ? phase : "waited";
  return phase;
}

const stop = (phase: ImportWaitPhase): ImportWaitPhase => phase === "checking" ? "ready" : phase === "waiting" ? "waited" : phase;

/**
 * Decides whether the operator waits for the import. A website just submitted
 * shows the wait at once, even before its import appears. The limit also
 * covers the check itself, so a request that hangs can't hold anyone here.
 */
export function useImportWait(job: WebsiteImportSummary | null, settled: boolean, justSubmitted = false) {
  const running = isWebsiteImportRunning(job);
  const [phase, setPhase] = useState<ImportWaitPhase>(() => justSubmitted && !settled ? "waiting" : nextPhase("checking", settled, running, justSubmitted));
  useEffect(() => { setPhase((current) => nextPhase(current, settled, running, justSubmitted)); }, [justSubmitted, settled, running]);
  const stopWaiting = useCallback(() => setPhase(stop), []);
  useEffect(() => {
    const limit = setTimeout(stopWaiting, IMPORT_WAIT_LIMIT_MS);
    return () => clearTimeout(limit);
  }, [stopWaiting]);
  return { phase, stopWaiting };
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** What the agent can do, one screen at a time, while it reads the operator's website. */
export function ImportWaitSlides() {
  const { t } = useTranslation("onboarding");
  const [index, setIndex] = useState(0);
  // Slides stop moving on their own once someone picks one, and for anyone who asked for less motion.
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held || prefersReducedMotion()) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [held]);
  const go = (step: number) => {
    setHeld(true);
    setIndex((current) => (current + step + SLIDES.length) % SLIDES.length);
  };
  const key = SLIDES[index]!;
  const Scene = IMPORT_WAIT_SCENES[key];

  return (
    <Surface className="flex flex-col gap-4 overflow-hidden p-4">
      {/* The key restarts the fade for each slide. Without motion, slides swap in place. */}
      <div className="flex flex-col gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300" key={key}>
        <Scene />
        <p className="text-center text-base font-medium">{t(`reading.slides.${key}`)}</p>
      </div>
      <div className="flex items-center justify-between">
        <Button aria-label={t("reading.previous")} onClick={() => go(-1)} size="icon-sm" type="button" variant="ghost"><ChevronLeft /></Button>
        <div aria-hidden="true" className="flex gap-1.5">
          {SLIDES.map((slide, position) => <span className={position === index ? "size-1.5 rounded-full bg-foreground" : "size-1.5 rounded-full bg-muted"} key={slide} />)}
        </div>
        <Button aria-label={t("reading.next")} onClick={() => go(1)} size="icon-sm" type="button" variant="ghost"><ChevronRight /></Button>
      </div>
    </Surface>
  );
}
