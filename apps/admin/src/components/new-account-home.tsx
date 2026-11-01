"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { OnboardingGoal } from "@lobbystack/domain";
import { useBusinessCan } from "@/components/business-capabilities-provider";
import { ForwardingGuide } from "@/components/call-forwarding-dialog";
import { phoneNumberChooserText } from "@/components/live-phone-number-settings-surface";
import { PageHeader } from "@/components/page-header";
import { PhoneNumberChooser, phoneNumberChooserApi } from "@/components/phone-number-chooser";
import { useTelemetry } from "@/components/product-analytics";
import { TrialPhoneVerification } from "@/components/trial-phone-verification";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { isWebsiteImportRunning, websiteImportHost, WebsiteImportProgress } from "@/components/website-import-progress";
import { type Activation, useActivation } from "@/hooks/use-activation";
import { forwardingCountry } from "@/lib/call-forwarding";
import { formatDuration } from "@/lib/duration";
import { formatDateTime } from "@/lib/locale";
import { currentStage, numberPath, TEACH_TASK_LINKS, teachTasks, type NumberPath, type StageId } from "@/lib/new-account-home";
import type { BillingUsageViewModel, PhoneNumberViewModel } from "@/lib/page-view-models";
import { formatPhoneNumberDisplay, inferPhoneCountry } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";
import { getTestCallStarter, startTestCall, subscribeTestCallStarter } from "@/lib/test-call-launcher";

type NumbersResponse = {
  phoneNumbers: PhoneNumberViewModel[];
  activeClaim?: { id: string; status: string } | null;
  replacement: { activeClaim?: { id: string; status: string } | null };
  partnerNumbers?: { available: boolean; trial?: boolean; refusal?: string | null; phoneVerified?: boolean } | null;
};

/** The first screen a new account gets: three stages toward its first real conversation. */
export function NewAccountHome({ businessId, goal }: { businessId: string; goal: OnboardingGoal | null }) {
  const { t } = useTranslation("dashboard");
  const { data: activation, needsNumberClaim, trialAvailable, upgrade } = useActivation(businessId);
  const numbers = useQuery({ queryKey: ["phone-numbers", businessId], refetchInterval: (query) => query.state.data?.activeClaim || query.state.data?.replacement.activeClaim ? 1000 : false, queryFn: () => requestJson<NumbersResponse>(`/api/phone-numbers?businessId=${encodeURIComponent(businessId)}`) });
  const sources = useQuery({ queryKey: ["setup", businessId], queryFn: () => requestJson<{ steps: Array<{ id: string; status: string }> }>(`/api/setup?businessId=${encodeURIComponent(businessId)}`) });
  // A trial number keeps its release date hidden, so any active number counts.
  const number = numbers.data?.phoneNumbers[0] ?? null;
  const pagesRead = activation?.websiteImport?.status === "completed" ? activation.websiteImport.indexedCount || activation.websiteImport.importedCount : 0;
  // The number stage never reads as done: a number answers nobody until the owner forwards their line, and that happens at their carrier.
  const done: Record<StageId, boolean> = {
    hear: (activation?.completedWebCalls ?? 0) > 0,
    teach: pagesRead > 0 || sources.data?.steps.find((step) => step.id === "sources")?.status === "complete",
    number: false,
  };
  const stage = currentStage(done);
  // Null follows the current stage. The operator's own pick holds until the stage changes.
  const [picked, setPicked] = useState<{ open: StageId | null; during: StageId } | null>(null);
  const open = picked?.during === stage ? picked.open : stage;
  const loaded = Boolean(activation && numbers.data && sources.data);
  const stages: Array<{ id: StageId; content: React.ReactNode }> = [
    { id: "hear", content: activation ? <HearStage activation={activation} goal={goal} pagesRead={pagesRead} /> : null },
    { id: "teach", content: activation ? <TeachStage activation={activation} goal={goal} /> : null },
    { id: "number", content: activation && numbers.data ? <NumberStage activation={activation} businessId={businessId} needsNumberClaim={needsNumberClaim} number={number} numbers={numbers.data} trialAvailable={trialAvailable} upgrade={upgrade} /> : null },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("home.title")} />
      <div className="flex w-full max-w-3xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="type-section-title">{t(`newAccountHome.title.${goal ?? "none"}`)}</h2>
          <p className="type-body-muted">{t("newAccountHome.description")}</p>
        </div>
        {loaded ? (
          <Surface>
            <Accordion onValueChange={(value) => setPicked({ open: (value[0] as StageId | undefined) ?? null, during: stage })} value={open ? [open] : []}>
              {stages.map(({ content, id }, index) => (
                <AccordionItem key={id} value={id}>
                  <AccordionTrigger className="min-h-16">
                    <span className="flex min-w-0 items-center gap-3">
                      <StageMarker done={done[id]} position={index + 1} />
                      <span className="truncate text-base">{t(`newAccountHome.${id}.title`)}</span>
                      {done[id] ? <Badge variant="secondary">{t("newAccountHome.done")}</Badge> : null}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent><div className="flex flex-col gap-4 sm:pl-9">{content}</div></AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Surface>
        ) : <Skeleton className="h-64 rounded-xl" />}
      </div>
    </div>
  );
}

function StageMarker({ done, position }: { done: boolean; position: number }) {
  if (done) return <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/70 text-background"><Check className="size-4" /></span>;
  return <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-foreground text-xs font-medium tabular-nums">{position}</span>;
}

function HearStage({ activation, goal, pagesRead }: { activation: Activation; goal: OnboardingGoal | null; pagesRead: number }) {
  const { i18n, t } = useTranslation("dashboard");
  const canStartTestCall = useSyncExternalStore(subscribeTestCallStarter, () => getTestCallStarter() !== null, () => false);
  const host = activation.websiteImport ? websiteImportHost(activation.websiteImport.websiteUrl) : null;
  const call = activation.lastTestCall;
  return (
    <>
      <p className="type-body-muted">{t(`newAccountHome.hear.prompt.${goal ?? "none"}`)}</p>
      {pagesRead > 0 && host ? <p className="type-body-muted">{t("newAccountHome.hear.read", { count: pagesRead, host })}</p> : null}
      {call ? (
        <Item render={<Link href={`/calls/${encodeURIComponent(call.id)}`} />} variant="outline">
          <ItemContent>
            <ItemTitle>{t("newAccountHome.hear.lastCall")}</ItemTitle>
            <ItemDescription>{t("newAccountHome.hear.lastCallDetails", { date: formatDateTime(call.startedAt, i18n.language, { dateStyle: "medium", timeStyle: "short" }), duration: formatDuration(call.durationSeconds) })}</ItemDescription>
          </ItemContent>
          <ItemActions><span className="type-body-muted hidden sm:inline">{t("newAccountHome.hear.readTranscript")}</span><ChevronRight className="size-4 text-muted-foreground" /></ItemActions>
        </Item>
      ) : null}
      {canStartTestCall ? <div><Button onClick={() => startTestCall()} type="button" variant={call ? "outline" : "default"}><Phone />{t(call ? "newAccountHome.hear.again" : "activation.hearIt.cta")}</Button></div> : null}
    </>
  );
}

function TeachStage({ activation, goal }: { activation: Activation; goal: OnboardingGoal | null }) {
  const { t } = useTranslation("dashboard");
  const job = activation.websiteImport;
  const showsImport = job && (isWebsiteImportRunning(job) || job.status === "failed" || job.status === "cancelled");
  return (
    <>
      <p className="type-body-muted">{t("newAccountHome.teach.description")}</p>
      {showsImport ? <WebsiteImportProgress job={job} /> : null}
      <ItemGroup>
        {teachTasks(goal, Boolean(activation.widgetsEnabled)).map((task) => (
          <Item key={task} render={<Link href={TEACH_TASK_LINKS[task]} />} variant="outline">
            <ItemContent>
              <ItemTitle>{t(`newAccountHome.teach.tasks.${task}.title`)}</ItemTitle>
              <ItemDescription>{t(`newAccountHome.teach.tasks.${task}.description`)}</ItemDescription>
            </ItemContent>
            <ItemActions><ChevronRight className="size-4 text-muted-foreground" /></ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </>
  );
}

type NumberStageProps = {
  activation: Activation;
  businessId: string;
  needsNumberClaim: boolean;
  number: PhoneNumberViewModel | null;
  numbers: NumbersResponse;
  trialAvailable: boolean;
  upgrade: () => void;
};

function NumberStage({ activation, businessId, needsNumberClaim, number, numbers, trialAvailable, upgrade }: NumberStageProps) {
  const { i18n, t } = useTranslation("dashboard");
  const can = useBusinessCan();
  const billing = useQuery({ queryKey: ["billing", businessId], enabled: can("billing"), queryFn: () => requestJson<Pick<BillingUsageViewModel, "entitlement">>(`/api/billing?businessId=${encodeURIComponent(businessId)}`) });
  if (number) {
    return (
      <>
        <p className="type-body">{t("newAccountHome.number.ready", { number: formatPhoneNumberDisplay(number.e164, i18n.language) })}</p>
        <ForwardingGuide country={forwardingCountry(number.e164, activation.country ?? null, inferPhoneCountry)} e164={number.e164} />
        <p className="type-body-muted">{t("newAccountHome.number.switches")}</p>
      </>
    );
  }
  if (numbers.activeClaim) return <Skeleton className="h-24 rounded-xl" />;
  if (can("billing") && !billing.data && !numbers.partnerNumbers && !trialAvailable) return <Skeleton className="h-24 rounded-xl" />;
  const path = numberPath({ includedNumbers: billing.data?.entitlement.includedNumbers, partnerNumbers: numbers.partnerNumbers, trialAvailable });
  return <NumberPathOffer businessId={businessId} needsNumberClaim={needsNumberClaim} path={path} upgrade={upgrade} />;
}

const PLAN_REQUIRED = new Set(["dedicated_number_requires_paid_plan", "trial_already_used", "trial_ip_limited", "trial_not_available"]);

function errorCode(error: unknown): string | undefined {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : undefined;
}

function NumberPathOffer({ businessId, needsNumberClaim, path, upgrade }: { businessId: string; needsNumberClaim: boolean; path: NumberPath; upgrade: () => void }) {
  const { t } = useTranslation("dashboard");
  const { t: tSettings } = useTranslation("settings");
  const queryClient = useQueryClient();
  const telemetry = useTelemetry();
  const [choosing, setChoosing] = useState(false);
  // The search can say what the status couldn't: the owner needs a verified mobile, or a plan.
  const [override, setOverride] = useState<"verify" | "plan" | null>(null);
  const active = override ?? path;
  useEffect(() => { if (active === "verify") setChoosing(false); }, [active]);
  const api = useMemo(() => phoneNumberChooserApi(false), []);
  const chooser = useMemo(() => {
    const noticed = (error: unknown) => {
      if (PLAN_REQUIRED.has(errorCode(error) ?? "")) setOverride("plan");
      if (errorCode(error) === "phone_verification_required") setOverride("verify");
    };
    return {
      ...api,
      getInitialNumberSuggestion: async (args: Parameters<typeof api.getInitialNumberSuggestion>[0]) => { try { return await api.getInitialNumberSuggestion(args); } catch (error) { noticed(error); throw error; } },
      claimNumber: async (args: Parameters<typeof api.claimNumber>[0]) => { try { return await api.claimNumber(args); } catch (error) { noticed(error); throw error; } },
    };
  }, [api]);
  const claimed = useCallback(() => {
    toast.success(tSettings("phoneNumber.toast.added"));
    for (const key of ["phone-numbers", "activation", "number-trial", "setup"]) void queryClient.invalidateQueries({ queryKey: [key, businessId] });
  }, [businessId, queryClient, tSettings]);

  if (active === "verify") return <div className="max-w-sm"><p className="type-body-muted mb-4">{tSettings("phoneNumber.trialPhone.description")}</p><TrialPhoneVerification businessId={businessId} onVerified={async () => { setOverride(null); await queryClient.invalidateQueries({ queryKey: ["phone-numbers", businessId] }); setChoosing(true); }} /></div>;
  if (choosing) {
    const text = phoneNumberChooserText(tSettings);
    return <PhoneNumberChooser businessId={businessId} claimNumber={chooser.claimNumber} getErrorMessage={text.getErrorMessage} getInitialNumberSuggestion={chooser.getInitialNumberSuggestion} labels={text.labels} onClaimCompleted={(number) => telemetry.track("web.onboarding.number_claim_completed", { businessId, countryCode: number.selectionContext.countryCode, selectionMode: number.selectionContext.mode, numberKind: number.kind })} onClaimStarted={(number) => telemetry.track("web.onboarding.number_claim_started", { businessId, countryCode: number.selectionContext.countryCode, selectionMode: number.selectionContext.mode, numberKind: number.kind })} onClaimed={claimed} searchAvailableNumbers={chooser.searchAvailableNumbers} />;
  }
  if (active === "trial") return <NumberOffer cta={t("activation.freeTrial.cta")} description={t("activation.freeTrial.description")} onClick={() => setChoosing(true)} title={t("activation.freeTrial.title")} />;
  if (active === "claim") return <NumberOffer cta={t("activation.claimNumber.cta")} description={t("newAccountHome.number.claim")} onClick={() => setChoosing(true)} title={t("activation.claimNumber.title")} />;
  if (active === "plan") return needsNumberClaim ? <p className="type-body-muted">{tSettings("phoneNumber.current.empty")}</p> : <NumberOffer cta={t("activation.upgrade.cta")} description={t("newAccountHome.number.plan")} onClick={upgrade} title={t("activation.upgrade.title")} />;
  if (active === "partnerLimit") return <p className="type-body-muted">{tSettings("phoneNumber.partnerTierRequired.description")}</p>;
  if (active === "partnerUnavailable") return <p className="type-body-muted">{tSettings("phoneNumber.partnerNumbersUnavailable.description")}</p>;
  return <p className="type-body-muted">{tSettings("phoneNumber.current.empty")}</p>;
}

function NumberOffer({ cta, description, onClick, title }: { cta: string; description: string; onClick: () => void; title: string }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="type-card-title text-foreground">{title}</p>
        <p className="type-body-muted">{description}</p>
      </div>
      <div><Button onClick={onClick} type="button">{cta}</Button></div>
    </>
  );
}
