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
 * Home's card for the phone line and the last 30 days. The top holds whether
 * the line is ready or taking calls, then each number with who answers it
 * first. One number has its Test call beside the heading; with several, each
 * row names its agent and has its own. The bottom holds `results`. A business with no
 * number gets the results alone.
 */
export function HomePhoneCard({ businessId, called, canSetUp, lines, results }: { businessId: string; called: boolean; canSetUp: boolean; lines: HomePhoneLine[]; results: ReactNode }) {
  const { i18n, t } = useTranslation("dashboard");
  if (!lines.length && !results) return null;
  const several = lines.length > 1;
  return (
    <Surface className="animate-in fade-in slide-in-from-bottom-2 duration-200">
      {lines.length ? (
        <section aria-labelledby="home-phone-title" className="border-b last:border-b-0">
          {/* With one number its Test call sits in the heading row; with several, each row has its own. */}
          <div className="flex items-center justify-between gap-4 px-6 pt-5" data-slot="phone-heading-row">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="type-section-title" id="home-phone-title">{t(phoneStatusKey(called, lines))}</h2>
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-status-success-foreground" data-slot="phone-status-dot" />
            </div>
            {several ? null : <div className="flex shrink-0"><TestCallButton agentId={lines[0]!.agentId} /></div>}
          </div>
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
                    {canSetUp ? <AnswersFirstChip agentId={line.agentId} businessId={businessId} label={answersFirst} /> : <Badge variant="secondary">{answersFirst}</Badge>}
                  </div>
                  {several ? <div className="flex shrink-0"><TestCallButton agentId={line.agentId} /></div> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {results}
    </Surface>
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
