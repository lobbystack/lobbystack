"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_RECEPTIONIST_VOICE, normalizeReceptionistVoice, normalizeRuntimeLocale, runtimeLocales, type ReceptionistVoice, type RuntimeLocale } from "@lobbystack/shared";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { LiveUpgradePlanProvider } from "@/components/live-upgrade-plan-provider";
import { useTelemetry } from "@/components/product-analytics";
import { TestPanel } from "@/components/test-window";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MeetFormSkeleton, TestPanelSkeleton } from "@/components/loading-skeletons";
import { Textarea } from "@/components/ui/textarea";
import { usePlanOfferOpener, useUpgradePlanDialogOpener } from "@/components/upgrade-plan-dialog-context";
import { VoiceDialog, voiceName, useVoicePreview, useVoiceTraits } from "@/components/voice-dialog";
import { isWebsiteImportRunning, type WebsiteImportSummary } from "@/components/website-import-progress";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { getSafeOnboardingErrorMessage } from "@/lib/onboarding-errors";
import { Flag } from "@/components/flag";
import { runtimeLocaleRegion } from "@/lib/country-flag";
import { requestJson } from "@/lib/request-json";

type Agent = { business: { defaultLocale: string } | null; profile: { name: string; greeting: string; voice: string } | null };
type Change = { name?: string; greeting?: string; voice?: ReceptionistVoice; locale?: RuntimeLocale };

/** The last screen: the operator tests the agent on the left and adjusts it on the right. */
export function OnboardingMeetSurface() {
  return <LiveUpgradePlanProvider><MeetAgent /></LiveUpgradePlanProvider>;
}

function MeetAgent() {
  const { t } = useTranslation("onboarding");
  const { t: tAgent } = useTranslation("agent");
  const router = useRouter();
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const { business } = useActiveBusiness();
  const businessId = business?.businessId;
  const openPlans = useUpgradePlanDialogOpener();
  const openOffer = usePlanOfferOpener();
  const agent = useQuery({ queryKey: ["onboarding-agent", businessId], queryFn: () => requestJson<Agent>("/api/agent"), enabled: Boolean(businessId) });
  // An import still running can set the language and with it the default greeting.
  const importing = useQuery({
    queryKey: ["onboarding-knowledge", businessId],
    queryFn: () => requestJson<{ documents: Array<{ id: string; websiteImport?: WebsiteImportSummary | null }> }>(`/api/knowledge?businessId=${encodeURIComponent(businessId!)}`),
    enabled: Boolean(businessId),
    retry: false,
    refetchInterval: (query) => query.state.data?.documents?.some((document) => isWebsiteImportRunning(document.websiteImport)) ? 2000 : false,
    select: (data) => data.documents.some((document) => isWebsiteImportRunning(document.websiteImport)),
  }).data;
  const wasImporting = useRef(false);
  useEffect(() => {
    if (wasImporting.current && importing === false) void queryClient.invalidateQueries({ queryKey: ["onboarding-agent", businessId] });
    wasImporting.current = Boolean(importing);
  }, [businessId, importing, queryClient]);

  const profile = agent.data?.profile;
  const savedLocale = normalizeRuntimeLocale(agent.data?.business?.defaultLocale);
  // Typed text wins over what the server sends back; everything else follows the server.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [greetingDraft, setGreetingDraft] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = nameDraft ?? profile?.name ?? "";
  const greeting = greetingDraft ?? profile?.greeting ?? "";
  const voice = profile ? normalizeReceptionistVoice(profile.voice) : DEFAULT_RECEPTIONIST_VOICE;
  const voicePreview = useVoicePreview(savedLocale);
  const voiceTraits = useVoiceTraits();

  const save = useMutation({
    mutationFn: async (change: Change) => await requestJson("/api/agent", { method: "PATCH", body: JSON.stringify(change) }),
    onSuccess: async (_result, change) => {
      if (change.name !== undefined) setNameDraft(null);
      if (change.greeting !== undefined) setGreetingDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["onboarding-agent", businessId] });
      if (change.locale !== undefined) await queryClient.invalidateQueries({ queryKey: ["businesses"] });
    },
    onError: (cause) => setError(getSafeOnboardingErrorMessage(cause, t, "meet.saveFailed")),
    meta: { inlineError: true },
  });
  const typedChange = (): Change => ({
    ...(nameDraft !== null && nameDraft.trim() && nameDraft.trim() !== profile?.name ? { name: nameDraft.trim() } : {}),
    ...(greetingDraft !== null && greetingDraft.trim() && greetingDraft.trim() !== profile?.greeting ? { greeting: greetingDraft.trim() } : {}),
  });
  // The panel on the left tests what's saved, so a field saves as soon as the operator leaves it.
  const saveTyped = () => {
    const change = typedChange();
    if (Object.keys(change).length) save.mutate(change);
  };
  const finish = useMutation({
    mutationFn: async () => {
      const change = typedChange();
      if (Object.keys(change).length) await save.mutateAsync(change);
      await requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(businessId!)}`, { method: "POST", body: JSON.stringify({ to: "complete" }) });
    },
    onSuccess: async () => {
      if (businessId) {
        telemetry.track("web.onboarding.meet_completed", { businessId });
        // The plans come at the door to the dashboard, and only after a test.
        // A failed check lets the person through rather than holding them here.
        const due = business?.partnerAccessLevel
          ? false
          : await requestJson<{ due: boolean }>(`/api/plan-offer?businessId=${encodeURIComponent(businessId)}`).then((answer) => answer.due).catch(() => false);
        if (due && openOffer) {
          await requestJson(`/api/plan-offer?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
          telemetry.track("web.onboarding.plan_offer_shown", { businessId, surface: "meet" });
          openOffer({
            onDismiss: () => {
              void requestJson(`/api/plan-offer?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({ dismissed: true }) }).catch(() => undefined);
              telemetry.track("web.onboarding.plan_offer_dismissed", { businessId, surface: "meet" });
              router.push("/");
              router.refresh();
            },
            onPlanClicked: (plan) => {
              void requestJson(`/api/plan-offer?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({ chosen: true }) }).catch(() => undefined);
              telemetry.track("web.onboarding.plan_offer_clicked", { businessId, surface: "meet", plan });
            },
          });
          await queryClient.invalidateQueries({ queryKey: ["businesses"] });
          return;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      router.push("/");
      router.refresh();
    },
    onError: (cause) => setError(getSafeOnboardingErrorMessage(cause, t, "meet.finishFailed")),
    meta: { inlineError: true },
  });

  return (
    <div className="grid w-full gap-6 lg:grid-cols-2">
      <div className="flex h-[32rem] flex-col rounded-xl border border-border p-4 lg:h-[36rem]">
        {business ? <TestPanel businessId={business.businessId} businessSlug={business.slug} onUpgrade={openPlans && !business.partnerAccessLevel ? openPlans : undefined} /> : <TestPanelSkeleton />}
      </div>
      <div className="flex flex-col gap-4">
        {profile ? (
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="meet-name">{t("meet.name")}</FieldLabel>
              <Input className="h-11" id="meet-name" maxLength={80} onBlur={saveTyped} onChange={(event) => setNameDraft(event.target.value)} value={name} />
            </Field>
            <Field>
              <FieldLabel htmlFor="meet-voice">{tAgent("fields.voice.label")}</FieldLabel>
              <div className="flex h-11 items-center justify-between gap-3 rounded-xl border border-border pr-1.5 pl-4">
                <span className="min-w-0 truncate text-sm">{tAgent("fields.voice.summary", { voice: voiceName(voice), traits: voiceTraits(voice) })}</span>
                <Button id="meet-voice" onClick={() => setVoiceOpen(true)} size="sm" type="button" variant="outline">{tAgent("fields.voice.change")}</Button>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="meet-greeting">{t("meet.greeting")}</FieldLabel>
              <Textarea className="min-h-28 rounded-xl" id="meet-greeting" onBlur={saveTyped} onChange={(event) => setGreetingDraft(event.target.value)} value={greeting} />
            </Field>
            <Field>
              <FieldLabel htmlFor="meet-language">{t("meet.language")}</FieldLabel>
              <Select items={runtimeLocales.map((code) => ({ value: code, label: t(`common:callerLanguage.${code}`) }))} onValueChange={(value) => { if (value && value !== savedLocale) save.mutate({ locale: value as RuntimeLocale }); }} value={savedLocale}>
                <SelectTrigger className="data-[size=default]:h-11 w-full *:data-[slot=select-value]:gap-2" id="meet-language"><SelectValue>{(value: RuntimeLocale | null) => value ? <><Flag region={runtimeLocaleRegion(value)} /><span className="truncate">{t(`common:callerLanguage.${value}`)}</span></> : null}</SelectValue></SelectTrigger>
                <SelectContent><SelectGroup>{runtimeLocales.map((code) => <SelectItem key={code} value={code}><Flag region={runtimeLocaleRegion(code)} />{t(`common:callerLanguage.${code}`)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        ) : <MeetFormSkeleton labels={{ name: t("meet.name"), voice: tAgent("fields.voice.label"), greeting: t("meet.greeting"), language: t("meet.language") }} />}
        {error ? <FieldError>{error}</FieldError> : null}
        <Button className="mt-2 h-11 w-full" disabled={!business || !profile || !greeting.trim() || !name.trim() || finish.isPending} onClick={() => { setError(null); finish.mutate(); }} type="button">
          {finish.isPending ? <><LoaderCircle className="size-4 animate-spin" />{t("meet.finishing")}</> : t("meet.finish")}
        </Button>
      </div>
      <VoiceDialog current={voice} onOpenChange={setVoiceOpen} onSave={async (next) => { try { await save.mutateAsync({ voice: next }); return true; } catch { return false; } }} open={voiceOpen} preview={voicePreview} saving={save.isPending} />
    </div>
  );
}
