"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Copy } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useBusinessCan } from "@/components/business-capabilities-provider";
import { CallForwardingDialog, ForwardingGuide } from "@/components/call-forwarding-dialog";
import { useCopiedField } from "@/components/detail-fields";
import { phoneNumberChooserText } from "@/components/live-phone-number-settings-surface";
import { PhoneNumberChooser, phoneNumberChooserApi } from "@/components/phone-number-chooser";
import { useTelemetry } from "@/components/product-analytics";
import { TrialPhoneVerification } from "@/components/trial-phone-verification";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { isWebsiteImportRunning, WebsiteImportProgress } from "@/components/website-import-progress";
import { type Activation, useActivation } from "@/hooks/use-activation";
import { forwardingCountry } from "@/lib/call-forwarding";
import { formatDuration } from "@/lib/duration";
import { formatDateTime } from "@/lib/locale";
import type { BillingUsageViewModel, PhoneNumberViewModel } from "@/lib/page-view-models";
import { formatPhoneNumberDisplay, inferPhoneCountry } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";
import { cn } from "@/lib/utils";
import { isSetupStepDone, numberPath, setupStepOrder, type NumberPath, type SetupGuide, type SetupStep, type SetupStepId } from "@/lib/setup-guide";
import { openTestWindow, useTestWindowReady } from "@/lib/test-window";
import { useCallSettleRefetch } from "@/lib/use-call-settle-refetch";
import { useSetupAction } from "@/lib/use-setup-action";
import { HOURS_EDITOR_HREF, needsHoursForBooking, useBusinessHours } from "./business-hours-section";

type GuideStepId = SetupStepId | "hours";
type GuideStep = { id: GuideStepId; status: string; documentId?: string | null };

type NumbersResponse = {
  phoneNumbers: PhoneNumberViewModel[];
  activeClaim?: { id: string; status: string } | null;
  replacement: { activeClaim?: { id: string; status: string } | null };
  partnerNumbers?: { available: boolean; trial?: boolean; refusal?: string | null; phoneVerified?: boolean } | null;
};

/** Omit the business until the person may read setup. A call or an import changes steps while the page sits still, so both poll. */
export function useSetupGuide(businessId: string | undefined, importing = false) {
  const callSettleInterval = useCallSettleRefetch();
  return useQuery({
    queryKey: ["setup", businessId],
    queryFn: () => requestJson<SetupGuide>(`/api/setup?businessId=${encodeURIComponent(businessId!)}`),
    enabled: Boolean(businessId),
    refetchInterval: () => callSettleInterval() || (importing ? 2500 : false),
  });
}

/** Getting started, which Home shows in place of its daily view. */
export function LiveSetupGuideSurface({ businessId }: { businessId: string }) {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: activation, needsNumberClaim, trialAvailable, upgrade } = useActivation(businessId);
  const job = activation?.websiteImport;
  const importing = isWebsiteImportRunning(job);
  const setup = useSetupGuide(businessId, importing);
  // Instant booking with no opening hours books nothing, so a business that
  // books instantly and has none gets a step for them: after its sources in
  // the classic list, before them in the number list. Hours the website scan
  // found hide it.
  const hours = useBusinessHours(businessId);
  const skippedSteps = useMemo(() => setup.data?.skippedSteps ?? [], [setup.data?.skippedSteps]);
  // Only skipping finishes the hours step: hours themselves hide it.
  const done = useCallback((step: GuideStep) => step.id === "hours" ? skippedSteps.includes("hours") : isSetupStepDone(step as SetupStep, skippedSteps), [skippedSteps]);
  // Finished steps move to the top, so what's left reads in order below them.
  const numberList = setup.data?.variant === "number";
  const order = setupStepOrder(setup.data);
  const steps = useMemo<GuideStep[]>(() => {
    const serverSteps: GuideStep[] = setupStepOrder({ variant: numberList ? "number" : "classic" }).flatMap((id) => setup.data?.steps.find((step) => step.id === id) ?? []);
    const sources = serverSteps.findIndex((step) => step.id === "sources");
    const at = numberList ? sources : sources + 1;
    const listed = needsHoursForBooking(hours.data) ? [...serverSteps.slice(0, at), { id: "hours" as const, status: "needs setup" }, ...serverSteps.slice(at)] : serverSteps;
    return [...listed.filter(done), ...listed.filter((step) => !done(step))];
  }, [done, hours.data, numberList, setup.data?.steps]);
  // A finished step stays shut, except that the test call keeps its transcript
  // in reach and the forwarding step shows the line it learned.
  const opens = useCallback((step: GuideStep) => !done(step) || (step.id === "testCall" && Boolean(activation?.lastTestCall)) || (step.id === "forwardCalls" && step.status === "complete"), [activation?.lastTestCall, done]);
  const completed = steps.filter(done).length;
  const active = steps.find((step) => !done(step))?.id ?? order[0]!;
  // The operator's own pick holds until the current step changes.
  const [picked, setPicked] = useState<{ step: GuideStepId; during: GuideStepId } | null>(null);
  const pickedStep = picked?.during === active ? steps.find((step) => step.id === picked.step) : undefined;
  const openStep = pickedStep && opens(pickedStep) ? pickedStep.id : active;
  // A link such as the welcome email's (`/?setup=phoneNumber`) opens its step, as a click on it would.
  useSetupAction(Boolean(setup.data), useCallback((action: string) => {
    // The number list's forwarding step stands for the classic number step.
    const step = steps.find((item) => item.id === (numberList && action === "phoneNumber" ? "forwardCalls" : action));
    if (!step || !opens(step)) return false;
    setPicked({ step: step.id, during: active });
    return true;
  }, [active, numberList, opens, steps]));
  const expand = useMutation({
    mutationFn: (documentId: string) => requestJson(`/api/knowledge/${encodeURIComponent(documentId)}?businessId=${encodeURIComponent(businessId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "expand" }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["setup", businessId] }); router.push("/business/knowledge"); },
  });
  const skip = useMutation({ mutationFn: (stepId: GuideStepId) => requestJson<{ skippedSteps: string[] }>(`/api/setup?businessId=${encodeURIComponent(businessId)}`, { method: "PATCH", body: JSON.stringify({ stepId, skipped: true }) }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["setup", businessId] }); } });

  return (
    <section className="flex w-full flex-col gap-4">
      <h2 className="type-section-title">{t("setupGuide.title")}</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-muted-foreground"><ProgressRing completed={completed} total={steps.length} /><p className="type-body-lg">{t("setupGuide.description", { completed, total: steps.length })}</p></div>
        <Button size="sm" disabled={skip.isPending} onClick={async () => { for (const step of steps) if (!skippedSteps.includes(step.id)) await skip.mutateAsync(step.id); }} type="button" variant="outline">{t("setupGuide.skip")}</Button>
      </div>
      <Surface>
        <Accordion onValueChange={(value) => { const next = value[0] as GuideStepId | undefined; const step = steps.find((item) => item.id === next); if (step && opens(step)) setPicked({ step: step.id, during: active }); }} value={[openStep]}>
          {steps.map((step) => {
            const finished = done(step);
            const locked = !opens(step);
            const skipLink = finished ? null : <Button className="h-auto px-0 underline underline-offset-4" disabled={skip.isPending} onClick={() => skip.mutate(step.id)} variant="link">{t("setupGuide.skipStep")}</Button>;
            return <AccordionItem key={step.id} value={step.id}>
              <AccordionTrigger aria-disabled={locked || undefined} className={locked ? "min-h-16 cursor-default px-6 [&_[data-icon=inline-end]]:opacity-0" : "min-h-16 px-6"} tabIndex={locked ? -1 : undefined}><span className="flex min-w-0 items-center gap-4"><StepMarker completed={finished} /><span className={finished ? "truncate type-body-lg text-muted-foreground line-through decoration-muted-foreground/70" : "truncate type-body-lg"}>{t(stepTitleKey(step, skippedSteps))}</span></span></AccordionTrigger>
              <AccordionContent aria-labelledby="" className="px-6"><div className="flex gap-4"><span className="size-6 shrink-0" /><div className="flex min-w-0 flex-1 flex-col gap-4">
                {step.id === "fullScan" ? (
                  <>
                    {job && (importing || job.status === "failed" || job.status === "cancelled") ? <WebsiteImportProgress inline job={job} /> : <StepDescription>{t("setupGuide.stepDescriptions.fullScan")}</StepDescription>}
                    <StepActions primary={importing ? null : <Button disabled={expand.isPending} onClick={() => { if (step.documentId) expand.mutate(step.documentId); }}>{t("setupGuide.stepActions.fullScan")}</Button>} skip={skipLink} />
                  </>
                ) : step.id === "sources" ? (
                  <>
                    <StepDescription>{t("setupGuide.stepDescriptions.sources")}</StepDescription>
                    <StepActions primary={<Button onClick={() => router.push("/business/knowledge?setup=upload")}>{t("setupGuide.stepActions.sources")}</Button>} skip={skipLink} />
                  </>
                ) : step.id === "hours" ? (
                  <>
                    <StepDescription>{t("setupGuide.stepDescriptions.hours")}</StepDescription>
                    <StepActions primary={<Button nativeButton={false} render={<Link href={HOURS_EDITOR_HREF} />}>{t("setupGuide.stepActions.hours")}</Button>} skip={skipLink} />
                  </>
                ) : step.id === "testCall" ? (
                  <TestCallStep call={activation?.lastTestCall ?? null} skip={skipLink} />
                ) : step.id === "phoneNumber" ? (
                  <NumberStep activation={activation} businessId={businessId} needsNumberClaim={needsNumberClaim} skip={skipLink} trialAvailable={trialAvailable} upgrade={upgrade} />
                ) : step.id === "callNumber" || step.id === "forwardCalls" ? (
                  <NumberListStep businessId={businessId} guide={setup.data!} skip={skipLink} step={step} upgrade={upgrade} />
                ) : null}
              </div></div></AccordionContent>
            </AccordionItem>;
          })}
        </Accordion>
      </Surface>
    </section>
  );
}

/** A step's title. The classic number step reads as forwarding once there's a number; the number list words its forwarding step for the owner's current line. */
function stepTitleKey(step: GuideStep, skippedSteps: readonly string[]): string {
  if (step.id === "phoneNumber" && step.status !== "needs setup" && !skippedSteps.includes(step.id)) return "setupGuide.steps.forwardCalls";
  if (step.id === "forwardCalls") return "setupGuide.steps.forwardFromCurrent";
  return `setupGuide.steps.${step.id}`;
}

/**
 * The number list's own steps: calling the number, and forwarding the
 * owner's current line to it. After a trial that ended without a plan the
 * number is gone, so both offer the plans instead.
 */
function NumberListStep({ businessId, guide, skip, step, upgrade }: { businessId: string; guide: SetupGuide; skip: ReactNode; step: GuideStep; upgrade: () => void }) {
  const { i18n, t } = useTranslation("dashboard");
  const queryClient = useQueryClient();
  const telemetry = useTelemetry();
  const [forwardingOpen, setForwardingOpen] = useState(false);
  const numbers = useQuery({ queryKey: ["phone-numbers", businessId], queryFn: () => requestJson<NumbersResponse>(`/api/phone-numbers?businessId=${encodeURIComponent(businessId)}`) });
  const confirm = useMutation({
    mutationFn: () => requestJson(`/api/setup/forwarding?businessId=${encodeURIComponent(businessId)}`, { method: "POST" }),
    onSuccess: async () => {
      telemetry.track("web.activation.forwarding_confirmed", { businessId });
      setForwardingOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["setup", businessId] });
    },
  });
  const done = step.status === "complete";
  if (guide.numberLost && !done) return <><StepDescription>{t("setupGuide.stepDescriptions.numberLost")}</StepDescription><StepActions primary={<Button onClick={upgrade} type="button">{t("setupGuide.stepActions.choosePlan")}</Button>} skip={skip} /></>;
  if (!numbers.data) return <Skeleton className="h-24 rounded-xl" />;
  const number = numbers.data.phoneNumbers[0];
  if (!number) return <><StepDescription>{t("setupGuide.stepDescriptions.numberLost")}</StepDescription><StepActions primary={<Button onClick={upgrade} type="button">{t("setupGuide.stepActions.choosePlan")}</Button>} skip={skip} /></>;
  const display = formatPhoneNumberDisplay(number.e164, i18n.language);
  if (step.id === "callNumber") {
    return <><StepDescription>{t("setupGuide.stepDescriptions.testCall")}</StepDescription><StepActions primary={<CallNumberAction display={display} e164={number.e164} />} skip={skip} /></>;
  }
  if (done) {
    const from = guide.forwarding?.forwardedFrom;
    return <StepDescription>{from ? t("setupGuide.forwardingFrom", { number: formatPhoneNumberDisplay(from, i18n.language) }) : t("setupGuide.forwardingWorks")}</StepDescription>;
  }
  return (
    <>
      <StepDescription>{t("setupGuide.stepDescriptions.forwardCalls", { number: display })}</StepDescription>
      <StepActions primary={<Button onClick={() => setForwardingOpen(true)} type="button">{t("setupGuide.stepActions.forwardCalls")}</Button>} skip={skip} />
      <CallForwardingDialog confirming={confirm.isPending} e164={number.e164} onConfirm={() => confirm.mutate()} onOpenChange={setForwardingOpen} open={forwardingOpen} />
    </>
  );
}

/**
 * A phone dials the number from the link. A desktop browser usually can't, so
 * there the owner reads or copies the number and calls it from their phone.
 * The pointer media query picks one in CSS, so server and client render alike.
 */
function CallNumberAction({ display, e164 }: { display: string; e164: string }) {
  const { t } = useTranslation("dashboard");
  const { copiedField, copy } = useCopiedField();
  const copied = copiedField === "number";
  return (
    <div className="flex min-w-0 items-center">
      <a className={cn(buttonVariants(), "pointer-fine:hidden")} href={`tel:${e164}`}>{t("setupGuide.stepActions.callNumber", { number: display })}</a>
      <div className="hidden min-w-0 flex-wrap items-center gap-3 pointer-fine:flex" data-testid="call-number-desktop">
        <span className="type-metric-sm">{display}</span>
        <Button onClick={() => copy(e164, "number")} size="sm" type="button" variant="outline">
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {t(copied ? "setupGuide.stepActions.numberCopied" : "setupGuide.stepActions.copyNumber")}
        </Button>
        <span className="sr-only" role="status">{copied ? t("setupGuide.stepActions.numberCopied") : ""}</span>
      </div>
    </div>
  );
}

function StepDescription({ children }: { children: ReactNode }) {
  return <p className="max-w-lg type-body-lg text-muted-foreground">{children}</p>;
}

function StepActions({ primary, skip }: { primary?: ReactNode; skip: ReactNode }) {
  return <div className="flex items-center justify-between gap-4">{primary ?? <span />}{skip}</div>;
}

function TestCallStep({ call, skip }: { call: NonNullable<Activation["lastTestCall"]> | null; skip: ReactNode }) {
  const { i18n, t } = useTranslation("dashboard");
  const testWindowReady = useTestWindowReady();
  return (
    <>
      <StepDescription>{t("setupGuide.stepDescriptions.testCall")}</StepDescription>
      {call ? (
        <Item render={<Link href={`/inbox?call=${encodeURIComponent(call.id)}`} />} variant="outline">
          <ItemContent>
            <ItemTitle>{t("setupGuide.lastCall")}</ItemTitle>
            <ItemDescription>{t("setupGuide.lastCallDetails", { date: formatDateTime(call.startedAt, i18n.language, { dateStyle: "medium", timeStyle: "short" }), duration: formatDuration(call.durationSeconds) })}</ItemDescription>
          </ItemContent>
          <ItemActions><span className="type-body-muted hidden sm:inline">{t("setupGuide.readTranscript")}</span><ChevronRight className="size-4 text-muted-foreground" /></ItemActions>
        </Item>
      ) : null}
      <StepActions primary={testWindowReady ? <Button onClick={() => openTestWindow()} type="button" variant={call ? "outline" : "default"}>{t(call ? "setupGuide.callAgain" : "setupGuide.stepActions.testCall")}</Button> : null} skip={skip} />
    </>
  );
}

type NumberStepProps = {
  activation: Activation | undefined;
  businessId: string;
  needsNumberClaim: boolean;
  skip: ReactNode;
  trialAvailable: boolean;
  upgrade: () => void;
};

function NumberStep({ activation, businessId, needsNumberClaim, skip, trialAvailable, upgrade }: NumberStepProps) {
  const can = useBusinessCan();
  const numbers = useQuery({ queryKey: ["phone-numbers", businessId], refetchInterval: (query) => query.state.data?.activeClaim || query.state.data?.replacement.activeClaim ? 1000 : false, queryFn: () => requestJson<NumbersResponse>(`/api/phone-numbers?businessId=${encodeURIComponent(businessId)}`) });
  const billing = useQuery({ queryKey: ["billing", businessId], enabled: can("billing"), queryFn: () => requestJson<Pick<BillingUsageViewModel, "entitlement">>(`/api/billing?businessId=${encodeURIComponent(businessId)}`) });
  const loading = <Skeleton className="h-24 rounded-xl" />;
  if (!activation || !numbers.data) return loading;
  // A trial number keeps its release date hidden, so any active number counts.
  const number = numbers.data.phoneNumbers[0];
  if (number) return <><ForwardingGuide country={forwardingCountry(number.e164, activation.country ?? null, inferPhoneCountry)} e164={number.e164} /><StepActions skip={skip} /></>;
  if (numbers.data.activeClaim) return loading;
  if (can("billing") && billing.isPending && !numbers.data.partnerNumbers && !trialAvailable) return loading;
  const path = numberPath({ includedNumbers: billing.data?.entitlement.includedNumbers, partnerNumbers: numbers.data.partnerNumbers, trialAvailable });
  return <NumberPathOffer businessId={businessId} needsNumberClaim={needsNumberClaim} path={path} skip={skip} upgrade={upgrade} />;
}

const PLAN_REQUIRED = new Set(["dedicated_number_requires_paid_plan", "trial_already_used", "trial_ip_limited", "trial_not_available"]);

function errorCode(error: unknown): string | undefined {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : undefined;
}

function NumberPathOffer({ businessId, needsNumberClaim, path, skip, upgrade }: { businessId: string; needsNumberClaim: boolean; path: NumberPath; skip: ReactNode; upgrade: () => void }) {
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
  const offer = (description: string, cta: string, onClick: () => void) => <><StepDescription>{description}</StepDescription><StepActions primary={<Button onClick={onClick} type="button">{cta}</Button>} skip={skip} /></>;
  const note = (text: string) => <><StepDescription>{text}</StepDescription><StepActions skip={skip} /></>;

  if (active === "verify") return <><div className="max-w-sm"><p className="type-body-muted mb-4">{tSettings("phoneNumber.trialPhone.description")}</p><TrialPhoneVerification businessId={businessId} onVerified={async () => { setOverride(null); await queryClient.invalidateQueries({ queryKey: ["phone-numbers", businessId] }); setChoosing(true); }} /></div><StepActions skip={skip} /></>;
  if (choosing) {
    const text = phoneNumberChooserText(tSettings);
    return <><PhoneNumberChooser businessId={businessId} claimNumber={chooser.claimNumber} getErrorMessage={text.getErrorMessage} getInitialNumberSuggestion={chooser.getInitialNumberSuggestion} labels={text.labels} onClaimCompleted={(number) => telemetry.track("web.onboarding.number_claim_completed", { businessId, countryCode: number.selectionContext.countryCode, selectionMode: number.selectionContext.mode, numberKind: number.kind })} onClaimStarted={(number) => telemetry.track("web.onboarding.number_claim_started", { businessId, countryCode: number.selectionContext.countryCode, selectionMode: number.selectionContext.mode, numberKind: number.kind })} onClaimed={claimed} searchAvailableNumbers={chooser.searchAvailableNumbers} /><StepActions skip={skip} /></>;
  }
  if (active === "trial") return offer(t("setupGuide.stepDescriptions.phoneNumberTrial"), t("activation.freeTrial.cta"), () => setChoosing(true));
  if (active === "claim") return offer(t("setupGuide.stepDescriptions.phoneNumber"), t("setupGuide.stepActions.phoneNumber"), () => setChoosing(true));
  if (active === "plan") return needsNumberClaim ? note(tSettings("phoneNumber.current.empty")) : offer(t("setupGuide.stepDescriptions.phoneNumber"), t("activation.upgrade.cta"), upgrade);
  if (active === "partnerLimit") return note(tSettings("phoneNumber.partnerTierRequired.description"));
  if (active === "partnerUnavailable") return note(tSettings("phoneNumber.partnerNumbersUnavailable.description"));
  return note(tSettings("phoneNumber.current.empty"));
}

function ProgressRing({ completed, total }: { completed: number; total: number }) {
  const circumference = 2 * Math.PI * 7;
  const offset = circumference * (1 - (total ? Math.min(completed / total, 1) : 0));
  return <svg aria-hidden="true" className="size-5 shrink-0 -rotate-90" viewBox="0 0 20 20"><circle className="stroke-border" cx="10" cy="10" fill="none" r="7" strokeWidth="1.75" /><circle className="stroke-foreground transition-[stroke-dashoffset] duration-300" cx="10" cy="10" fill="none" r="7" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" strokeWidth="1.75" /></svg>;
}

function StepMarker({ completed }: { completed: boolean }) {
  if (completed) return <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/70 text-background"><Check className="size-4" /></span>;
  return <span className="relative flex size-6 shrink-0 items-center justify-center bg-background"><svg aria-hidden="true" className="absolute inset-0 size-6" viewBox="0 0 24 24"><circle className="stroke-foreground" cx="12" cy="12" fill="none" r="10.5" strokeDasharray="6.8 4.2" strokeLinecap="round" strokeWidth="1.5" /></svg></span>;
}
