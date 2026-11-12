"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { StaffFirstMode } from "@lobbystack/shared";

import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { TestCallButton } from "@/components/navigation/test-call-button";
import { StaffFirstDialog } from "@/components/staff-first-dialog";
import { useAgentSettingsQuery, useSaveAgent } from "@/hooks/use-agent-settings";
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
 * Home's phone line and last 30 days. Over the card, a section heading says
 * whether the line is ready or taking calls. The card starts with each number,
 * its Test call level with it, and who answers it first; with several numbers
 * each row names its agent. Under a divider it holds `results`. A business
 * with no number gets the card with the results alone, and no heading.
 */
export function HomePhoneCard({ businessId, called, canSetUp, lines, results }: { businessId: string; called: boolean; canSetUp: boolean; lines: HomePhoneLine[]; results: ReactNode }) {
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
              <li className="flex flex-col gap-2 px-6 py-4" key={line.e164}>
                {/* The Test call sits level with the number, right-aligned. */}
                <div className="flex items-center justify-between gap-4" data-slot="phone-number-row">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="type-metric-sm whitespace-nowrap">{formatPhoneNumberDisplay(line.e164, i18n.language)}</p>
                    {several ? <p className="type-body-muted min-w-0 truncate">{line.agentName}</p> : null}
                  </div>
                  <div className="flex shrink-0"><TestCallButton agentId={line.agentId} /></div>
                </div>
                {canSetUp ? <AnswersFirstChip agentId={line.agentId} businessId={businessId} label={answersFirst} /> : <Badge variant="secondary">{answersFirst}</Badge>}
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
      <div className="flex items-start gap-2 px-1">
        <h2 className="type-section-title" id="home-phone-title">{t(phoneStatusKey(called, lines))}</h2>
        {/* One heading line tall, so the dot centers on the first line's capitals even when the heading wraps. */}
        <span aria-hidden="true" className="flex h-lh shrink-0 items-center type-section-title" data-slot="phone-status-dot-line">
          <span className="size-2 rounded-full bg-status-success-foreground" data-slot="phone-status-dot" />
        </span>
      </div>
      {card}
    </section>
  );
}

/** Who answers first, as a chip that opens the agent's Staff answers first dialog right on Home. */
function AnswersFirstChip({ agentId, businessId, label }: { agentId: string; businessId: string; label: string }) {
  const [open, setOpen] = useState(false);
  // The dialog loads the agent's settings on the first click, then stays mounted so it can animate out.
  const [opened, setOpened] = useState(false);
  return (
    <>
      <Badge className="cursor-pointer hover:bg-pill/80" onClick={() => { setOpened(true); setOpen(true); }} render={<button aria-haspopup="dialog" type="button" />} variant="secondary">{label}<ChevronRight data-icon="inline-end" /></Badge>
      {opened ? <AgentStaffFirstDialog agentId={agentId} businessId={businessId} onOpenChange={setOpen} open={open} /> : null}
    </>
  );
}

/** The shared dialog on one agent's saved settings. A save refreshes Home, so the chip says the new setting. */
function AgentStaffFirstDialog({ agentId, businessId, onOpenChange, open }: { agentId: string; businessId: string; onOpenChange: (open: boolean) => void; open: boolean }) {
  const queryClient = useQueryClient();
  const settings = useAgentSettingsQuery(businessId, agentId);
  const save = useSaveAgent(businessId, agentId);
  return (
    <StaffFirstDialog
      businessId={businessId}
      defaultLocale={settings.data?.business?.defaultLocale ?? "en"}
      onOpenChange={onOpenChange}
      onSave={async (patch) => {
        await save(patch);
        await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }}
      open={open}
      profile={settings.data?.profile}
    />
  );
}
