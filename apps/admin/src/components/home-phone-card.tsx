"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StaffFirstMode } from "@lobbystack/shared";

import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { TestCallButton } from "@/components/navigation/test-call-button";
import { STAFF_FIRST_ANCHOR } from "@/components/staff-first-section";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { cn } from "@/lib/utils";

export type HomePhoneLine = { e164: string; agentId: string; agentName: string; staffFirstMode: StaffFirstMode };

/** Who picks up a call to the number first, as the agent's Staff answers first setting says. */
export const ANSWERS_FIRST_KEYS = {
  never: "home.phone.answersFirst.agent",
  always: "home.phone.answersFirst.team",
  business_hours: "home.phone.answersFirst.teamDuringHours",
} as const satisfies Record<StaffFirstMode, string>;

/**
 * The business's numbers at the top of Home: each number, who answers it first
 * and its Test call, under whether the line has taken a call yet. With several
 * numbers each row names its agent. A business with no number gets no card.
 */
export function HomePhoneCard({ called, canSetUp, lines }: { called: boolean; canSetUp: boolean; lines: HomePhoneLine[] }) {
  const { i18n, t } = useTranslation("dashboard");
  if (!lines.length) return null;
  const several = lines.length > 1;
  return (
    <section aria-labelledby="home-phone-title" className="animate-in fade-in slide-in-from-bottom-2 duration-200 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
        <h2 className="type-section-title" id="home-phone-title">{t(several ? "home.phone.titleMany" : "home.phone.title")}</h2>
        <PhoneStatus called={called} />
      </div>
      <Surface>
        <ul className="divide-y divide-border">
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
      </Surface>
    </section>
  );
}

/** A grey dot while the business waits for its first call, then a green one. */
function PhoneStatus({ called }: { called: boolean }) {
  const { t } = useTranslation("dashboard");
  return (
    <p className="type-body-muted flex items-center gap-2">
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", called ? "bg-status-success-foreground" : "bg-muted-foreground/50")} />
      {t(called ? "home.phone.status.answering" : "home.phone.status.waiting")}
    </p>
  );
}
