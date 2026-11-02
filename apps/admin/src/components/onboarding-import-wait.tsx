"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, FileText, Languages, MessageCircleQuestion, MessagesSquare, PhoneForwarded } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Surface } from "./ui/surface";
import { isWebsiteImportRunning, type WebsiteImportSummary } from "./website-import-progress";

/**
 * Most imports still running when the operator reaches the test call finish
 * within this limit, and waiting longer catches almost none of the rest. Those
 * few run for minutes, so the operator moves on and they keep reading.
 */
export const IMPORT_WAIT_LIMIT_MS = 90_000;

const SLIDE_MS = 7_000;

// Each one describes something the agent does today: a tool in agent-core, or a dashboard page.
const SLIDES = [
  { key: "answers", Icon: MessageCircleQuestion },
  { key: "booking", Icon: CalendarCheck },
  { key: "transfer", Icon: PhoneForwarded },
  { key: "languages", Icon: Languages },
  { key: "summaries", Icon: FileText },
  { key: "widget", Icon: MessagesSquare },
] as const;

/** checking: no answer yet. waiting: the screen shows. waited: the screen showed and ended. ready: it never showed. */
export type ImportWaitPhase = "checking" | "waiting" | "waited" | "ready";

function nextPhase(phase: ImportWaitPhase, settled: boolean, running: boolean): ImportWaitPhase {
  if (phase === "checking") return !settled ? phase : running ? "waiting" : "ready";
  if (phase === "waiting") return running ? phase : "waited";
  return phase;
}

const stop = (phase: ImportWaitPhase): ImportWaitPhase => phase === "checking" ? "ready" : phase === "waiting" ? "waited" : phase;

/**
 * Decides whether the operator waits for the import before their test call.
 * The wait only ever ends: it can't come back and cut off a call in progress.
 * The limit also covers the check itself, so a request that hangs can't hold
 * anyone here.
 */
export function useImportWait(job: WebsiteImportSummary | null, settled: boolean) {
  const running = isWebsiteImportRunning(job);
  const [phase, setPhase] = useState<ImportWaitPhase>(() => nextPhase("checking", settled, running));
  useEffect(() => { setPhase((current) => nextPhase(current, settled, running)); }, [settled, running]);
  const stopWaiting = useCallback(() => setPhase(stop), []);
  useEffect(() => {
    const limit = setTimeout(stopWaiting, IMPORT_WAIT_LIMIT_MS);
    return () => clearTimeout(limit);
  }, [stopWaiting]);
  return { phase, stopWaiting };
}

/** What the agent can do, shown one at a time while it reads the operator's website. */
export function ImportWaitSlides() {
  const { t } = useTranslation("onboarding");
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => (current + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, []);
  const { key, Icon } = SLIDES[index]!;

  return (
    <Surface className="flex min-h-40 flex-col justify-between gap-4 p-6">
      {/* The key restarts the fade for each slide. Without motion, slides swap in place. */}
      <div className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300" key={key}>
        <span className="flex size-10 items-center justify-center rounded-full bg-muted">
          <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
        </span>
        <p className="text-base font-medium">{t(`testCall.wait.slides.${key}.title`)}</p>
      </div>
      <div aria-hidden="true" className="flex gap-1.5">
        {SLIDES.map((slide, position) => <span className={position === index ? "size-1.5 rounded-full bg-foreground" : "size-1.5 rounded-full bg-muted"} key={slide.key} />)}
      </div>
    </Surface>
  );
}
