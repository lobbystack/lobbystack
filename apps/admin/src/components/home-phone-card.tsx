"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StaffFirstMode } from "@lobbystack/shared";

import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { TestCallButton } from "@/components/navigation/test-call-button";
import { STAFF_FIRST_ANCHOR } from "@/components/staff-first-section";
import { formatPhoneNumberDisplay } from "@/lib/phone";

export type HomePhoneLine = { e164: string; agentId: string; agentName: string; staffFirstMode: StaffFirstMode };

/** Who picks up a call to the number first, as the agent's Staff answers first setting says. */
export const ANSWERS_FIRST_KEYS = {
  never: "home.phone.answersFirst.agent",
  always: "home.phone.answersFirst.team",
  business_hours: "home.phone.answersFirst.teamDuringHours",
} as const satisfies Record<StaffFirstMode, string>;

/** The heading over the numbers: ready before the first call, then the agent, or the agents, taking calls. */
export function phoneStatusKey(called: boolean, lines: ReadonlyArray<Pick<HomePhoneLine, "agentId">>) {
  if (!called) return "home.phone.status.ready" as const;
  return new Set(lines.map((line) => line.agentId)).size > 1 ? "home.phone.status.liveMany" as const : "home.phone.status.live" as const;
}

/**
 * Home's phone line and last 30 days. Over the card, a heading says whether
 * the line is ready or taking calls. The card starts with each number, who
 * answers it first and its Test call; with several numbers each row names its
 * agent. Under a divider it holds `results`. A business with no number gets
 * the card with the results alone, and no heading.
 */
export function HomePhoneCard({ called, canSetUp, lines, results }: { called: boolean; canSetUp: boolean; lines: HomePhoneLine[]; results: ReactNode }) {
  const { i18n, t } = useTranslation("dashboard");
  if (!lines.length && !results) return null;
  const several = lines.length > 1;
  const card = (
    <Surface className="animate-in fade-in slide-in-from-bottom-2 duration-200">
      {lines.length ? (
        <ul className="divide-y divide-border border-b last:border-b-0" data-slot="phone-lines">
          {lines.map((line) => {
            const answersFirst = t(ANSWERS_FIRST_KEYS[line.staffFirstMode]);
            return (
              <li className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6" key={line.e164}>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="type-metric-sm whitespace-nowrap">{formatPhoneNumberDisplay(line.e164, i18n.language)}</p>
                    {several ? <p className="type-body-muted min-w-0 truncate">{line.agentName}</p> : null}
                  </div>
                  {canSetUp ? (
                    <Badge render={<Link href={`/agents/${encodeURIComponent(line.agentId)}#${STAFF_FIRST_ANCHOR}`} />} variant="secondary">{answersFirst}<ChevronRight data-icon="inline-end" /></Badge>
                  ) : <Badge variant="secondary">{answersFirst}</Badge>}
                </div>
                <div className="flex shrink-0"><TestCallButton agentId={line.agentId} /></div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {results}
    </Surface>
  );
  if (!lines.length) return card;
  return (
    <section aria-labelledby="home-phone-title" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <h2 className="type-section-title" id="home-phone-title">{t(phoneStatusKey(called, lines))}</h2>
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-status-success-foreground" data-slot="phone-status-dot" />
      </div>
      {card}
    </section>
  );
}
