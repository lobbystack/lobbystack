"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { requestJson } from "@/lib/request-json";
import { appointmentChangeVerificationModes, DEFAULT_RECEPTIONIST_VOICE, intlLocale, isTransferCountry, normalizeBookingMode, normalizeReceptionistVoice, runtimeLocales, type AppointmentChangePolicy, type AppointmentChangeVerificationMode, type BookingMode, type ReceptionistVoice, type RuntimeLocale } from "@lobbystack/shared";
import type { Country } from "react-phone-number-input/input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList, ComboboxTrigger, ComboboxValue } from "@/components/ui/combobox";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { useTelemetry } from "@/components/product-analytics";
import { VoiceDialog, voiceName, useVoicePreview, useVoiceTraits } from "@/components/voice-dialog";
import { BusinessHoursSection } from "@/components/business-hours-section";
import { availableTimeZones, groupTimeZones, isTimeZoneRegion, type TimeZoneOption } from "@/lib/time-zones";
import { errorCode } from "@/lib/checkout-errors";
import { PhoneCountrySelect } from "@/components/phone-country-select";
import { getDefaultTransferCountry, getPhoneCountryOptions, inferPhoneCountry } from "@/lib/phone";
import { cn } from "@/lib/utils";

type AgentBasicSettingsPageProps = {
  businessId: string;
  canManageTenant: boolean;
};

type TimeZoneItemGroup = { value: string; label: string; items: TimeZoneOption[] };

type CurrencyOption = { id: string; label: string };

type AgentSettings = {
  business: { defaultLocale: RuntimeLocale; teamLocale?: RuntimeLocale | null; timezone: string; currency?: string } | null;
  profile: { greeting: string; summary: string; summarySource: "placeholder" | "generated" | "operator"; summaryRegenerateStatus?: "pending" | "completed" | "empty" | "failed" | null; transferNumber: string | null; transferMode: string; appointmentChangePolicy: AppointmentChangePolicy | null; bookingMode: BookingMode; voice?: string } | null;
  hasKnowledgeSources?: boolean;
};

// Matches SelectTrigger, so the searchable timezone picker looks like the selects beside it.
const COMBOBOX_TRIGGER_CLASS = "flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded-4xl border border-input bg-input/30 px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 enabled:hover:bg-input/50 sm:w-56";

export function resolveTransferNumberForSave({
  rawInputValue,
  validTransferNumber,
}: {
  rawInputValue: string;
  validTransferNumber: string;
}):
  | { ok: true; value: string | null }
  | { ok: false; errorKey: "agent:fields.transferNumber.errors.invalid" } {
  const trimmedVisibleTransferNumber = rawInputValue.trim();
  if (trimmedVisibleTransferNumber.length === 0) {
    return { ok: true, value: null };
  }

  const trimmedTransferNumber = validTransferNumber.trim();
  if (trimmedTransferNumber.length > 0) {
    return { ok: true, value: trimmedTransferNumber };
  }

  return {
    ok: false,
    errorKey: "agent:fields.transferNumber.errors.invalid",
  };
}

export function buildAppointmentChangePolicyForSave({
  allowCancel,
  allowReschedule,
  verificationMode,
}: {
  allowCancel: boolean;
  allowReschedule: boolean;
  verificationMode: AppointmentChangeVerificationMode;
}): AppointmentChangePolicy {
  return {
    enabled: allowCancel || allowReschedule,
    allowCancel,
    allowReschedule,
    verificationMode,
  };
}

// The checks the dashboard offers. A business saved as operator_only keeps
// that option in the select while it's the saved mode.
const offeredVerificationModes: AppointmentChangeVerificationMode[] = ["phone_match_and_facts", "otp_required", "passcode_required"];

function savedVerificationMode(value: unknown): AppointmentChangeVerificationMode {
  return (appointmentChangeVerificationModes as readonly unknown[]).includes(value) ? value as AppointmentChangeVerificationMode : "phone_match_and_facts";
}

export function AgentBasicSettingsPage({
  businessId,
  canManageTenant,
}: AgentBasicSettingsPageProps) {
  const { i18n, t } = useTranslation(["agent", "common", "settings"]);
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["agent-settings", businessId],
    queryFn: () => requestJson<AgentSettings>(`/api/agent?businessId=${encodeURIComponent(businessId)}`),
    enabled: Boolean(businessId),
  });
  const configuration = query.data;
  const isLoadingConfiguration = !businessId || query.isLoading;
  async function saveProfile({ defaultLocale: locale, ...patch }: { businessId: string; defaultLocale?: RuntimeLocale; teamLocale?: RuntimeLocale | null; timezone?: string; currency?: string; greeting?: string; summary?: string; regenerateSummary?: true; transferNumber?: string | null; transferMode?: string; appointmentChangePolicy?: AppointmentChangePolicy; bookingMode?: BookingMode; voice?: ReceptionistVoice }, refetchType: "active" | "none" = "active") {
    await requestJson(`/api/agent?businessId=${encodeURIComponent(businessId)}`, { method: "PATCH", body: JSON.stringify({ ...patch, ...(locale ? { locale } : {}) }) });
    await queryClient.invalidateQueries({ queryKey: ["agent-settings", businessId], refetchType });
  }
  const persistedProfile = configuration?.profile;
  const canRewriteSummary = configuration?.hasKnowledgeSources !== false;
  // The sign-up placeholder isn't a summary, so it shows as empty.
  const savedSummary = persistedProfile && persistedProfile.summarySource !== "placeholder" ? persistedProfile.summary : "";
  const savedTimezone = configuration?.business?.timezone ?? "";
  // Built once the business's zone loads, so the server render and hydration agree.
  const timeZoneGroups = useMemo(() => savedTimezone ? groupTimeZones(availableTimeZones(savedTimezone), intlLocale(i18n.language)) : [], [savedTimezone, i18n.language]);
  const timeZoneItems = useMemo<TimeZoneItemGroup[]>(() => timeZoneGroups.map((group) => ({
    value: group.region ?? "",
    label: group.region === null ? "" : isTimeZoneRegion(group.region) ? t(`agent:fields.timezone.regions.${group.region.toLowerCase()}`) : group.region,
    items: group.zones,
  })), [t, timeZoneGroups]);
  const currencyItems = useMemo<CurrencyOption[]>(() => {
    const names = new Intl.DisplayNames([intlLocale(i18n.language)], { type: "currency", fallback: "code" });
    return Intl.supportedValuesOf("currency").map((code) => ({ id: code, label: `${code} · ${names.of(code) ?? code}` }));
  }, [i18n.language]);

  const [greeting, setGreeting] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryStatus, setSummaryStatus] = useState<string | null>(null);
  const [isSummarySaving, setIsSummarySaving] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  // While a requested rewrite runs, a separate query checks on it, so the page's drafts aren't reset every few seconds.
  const [awaitingRewrite, setAwaitingRewrite] = useState(false);
  // The rewritten summary as typed out so far in the open dialog; null when nothing is being typed.
  const [typedSummary, setTypedSummary] = useState<string | null>(null);
  const [typingTarget, setTypingTarget] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const rewritingInDialog = isSummaryOpen && (awaitingRewrite || typingTarget !== null);
  const rewriteStatus = persistedProfile?.summaryRegenerateStatus;
  useEffect(() => {
    if (rewriteStatus !== "pending") return;
    setAwaitingRewrite(true);
    setSummaryStatus(t("agent:fields.summary.regenerating"));
  }, [rewriteStatus, t]);
  const rewrite = useQuery({
    queryKey: ["agent-summary-rewrite", businessId],
    queryFn: () => requestJson<AgentSettings>(`/api/agent?businessId=${encodeURIComponent(businessId)}`),
    enabled: awaitingRewrite,
    refetchInterval: 3000,
  });
  useEffect(() => {
    const latest = rewrite.data;
    const outcome = latest?.profile?.summaryRegenerateStatus;
    if (!awaitingRewrite || !latest || outcome === "pending") return;
    setAwaitingRewrite(false);
    setSummaryStatus(null);
    queryClient.removeQueries({ queryKey: ["agent-summary-rewrite", businessId] });
    queryClient.setQueryData(["agent-settings", businessId], latest);
    if (outcome === "completed" && isSummaryOpen && !reduceMotion && latest.profile?.summary) {
      setTypedSummary("");
      setTypingTarget(latest.profile.summary);
    } else if (outcome === "completed") toast.success(t("agent:fields.summary.rewriteCompleted"));
    else if (outcome === "empty") toast.warning(t("agent:fields.summary.rewriteEmpty"));
    else if (outcome === "failed") toast.error(t("agent:fields.summary.rewriteFailed"));
  }, [awaitingRewrite, businessId, isSummaryOpen, queryClient, reduceMotion, rewrite.data, t]);
  useEffect(() => {
    if (typingTarget === null) return;
    // About 1.5 seconds whatever the length, at one frame per step.
    const step = Math.max(1, Math.ceil(typingTarget.length / 90));
    let length = 0;
    const intervalId = window.setInterval(() => {
      length = Math.min(typingTarget.length, length + step);
      setTypedSummary(typingTarget.slice(0, length));
      if (length < typingTarget.length) return;
      window.clearInterval(intervalId);
      setTypedSummary(null);
      setTypingTarget(null);
      toast.success(t("agent:fields.summary.rewriteCompleted"));
    }, 16);
    return () => window.clearInterval(intervalId);
  }, [t, typingTarget]);
  const [defaultLocale, setDefaultLocale] = useState<RuntimeLocale>("en");
  const [timezone, setTimezone] = useState("");
  const [isTimezoneSaving, setIsTimezoneSaving] = useState(false);
  const [currency, setCurrency] = useState("");
  const [isCurrencySaving, setIsCurrencySaving] = useState(false);
  const [transferNumber, setTransferNumber] = useState("");
  const [transferNumberInputValue, setTransferNumberInputValue] = useState("");
  const defaultTransferCountry = getDefaultTransferCountry(i18n.language) as Country;
  const countries = useMemo(() => getPhoneCountryOptions(i18n.language), [i18n.language]);
  const [transferCountry, setTransferCountry] = useState<Country>(defaultTransferCountry);
  const [allowAppointmentCancel, setAllowAppointmentCancel] = useState(true);
  const [allowAppointmentReschedule, setAllowAppointmentReschedule] = useState(true);
  const [appointmentChangeVerification, setAppointmentChangeVerification] = useState<AppointmentChangeVerificationMode>("phone_match_and_facts");
  const [bookingMode, setBookingMode] = useState<BookingMode>("instant");
  const [isBookingModeSaving, setIsBookingModeSaving] = useState(false);
  const [voice, setVoice] = useState<ReceptionistVoice>(DEFAULT_RECEPTIONIST_VOICE);
  const [isVoiceSaving, setIsVoiceSaving] = useState(false);
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const voiceTraits = useVoiceTraits();
  const voicePreview = useVoicePreview(configuration?.business?.defaultLocale ?? "en");
  // The utility bar's test call widget registers itself; this page only starts it.
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [isGreetingSaving, setIsGreetingSaving] = useState(false);
  const [isGreetingOpen, setIsGreetingOpen] = useState(false);
  const [isLocaleSaving, setIsLocaleSaving] = useState(false);
  // "default" follows the caller language.
  const [teamLocale, setTeamLocale] = useState<RuntimeLocale | "default">("default");
  const [isTeamLocaleSaving, setIsTeamLocaleSaving] = useState(false);
  const [isTransferSaving, setIsTransferSaving] = useState(false);
  const [isAppointmentChangeSaving, setIsAppointmentChangeSaving] = useState(false);
  // The profile the text fields last took their values from. Every save refetches the
  // settings, and a refetch that lands while someone is typing must not undo their edit,
  // so the greeting and summary only take the new value while they still hold the last
  // one, and the transfer number only while nobody has edited it since it was saved.
  // Switching business keeps the page mounted, and none of it carries over to the next one.
  const syncedBusinessId = useRef(businessId);
  const syncedProfile = useRef<NonNullable<AgentSettings["profile"]> | null>(null);
  const transferNumberRef = useRef(transferNumber);
  transferNumberRef.current = transferNumber;
  const transferNumberEdited = useRef(false);
  useEffect(() => {
    if (syncedBusinessId.current !== businessId) {
      syncedBusinessId.current = businessId;
      syncedProfile.current = null;
      transferNumberEdited.current = false;
    }
    setTimezone(configuration?.business?.timezone ?? "");
    setCurrency(configuration?.business?.currency ?? "");
    const profile = configuration?.profile;
    if (!profile) {
      return;
    }
    const previous = syncedProfile.current;
    syncedProfile.current = profile;
    // The sign-up placeholder isn't a summary, so the field starts empty.
    const shownSummary = (value: NonNullable<AgentSettings["profile"]>) => value.summarySource === "placeholder" ? "" : value.summary;
    setGreeting((current) => !previous || current === previous.greeting ? profile.greeting : current);
    setSummary((current) => !previous || current === shownSummary(previous) ? shownSummary(profile) : current);
    setDefaultLocale(configuration.business?.defaultLocale ?? "en");
    setTeamLocale(configuration.business?.teamLocale ?? "default");
    if (!transferNumberEdited.current) {
      setTransferNumber(profile.transferNumber ?? "");
      setTransferNumberInputValue(profile.transferNumber ?? "");
    }
    setBookingMode(normalizeBookingMode(profile.bookingMode));
    setVoice(normalizeReceptionistVoice(profile.voice));
    const appointmentChangePolicy = profile.appointmentChangePolicy as AppointmentChangePolicy | null;
    setAllowAppointmentCancel(appointmentChangePolicy?.allowCancel ?? true);
    setAllowAppointmentReschedule(appointmentChangePolicy?.allowReschedule ?? true);
    setAppointmentChangeVerification(savedVerificationMode(appointmentChangePolicy?.verificationMode));
  }, [businessId, configuration]);
  const verificationChoices = offeredVerificationModes.includes(appointmentChangeVerification) ? offeredVerificationModes : [...offeredVerificationModes, appointmentChangeVerification];

  // The saved number's country, else the locale's.
  const savedTransferNumber = configuration?.profile?.transferNumber;
  useEffect(() => {
    setTransferCountry((inferPhoneCountry(savedTransferNumber, defaultTransferCountry) ?? defaultTransferCountry) as Country);
  }, [defaultTransferCountry, savedTransferNumber]);

  useEffect(() => {
    if (!transferStatus) return;
    const timeoutId = window.setTimeout(() => setTransferStatus(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [transferStatus]);

  async function saveGreeting(): Promise<void> {
    if (!canManageTenant || !persistedProfile) {
      return;
    }

    setIsGreetingSaving(true);
    try {
      // Only the greeting: the dialog hides the other fields, so their drafts stay unsaved.
      await saveProfile({ businessId, greeting });
      telemetry.track("web.agent.settings_saved", { businessId, setting: "greeting" });
      toast.success(t("agent:actions.saved"));
      setIsGreetingOpen(false);
    } catch {
      toast.error(t("agent:actions.saveFailed"));
    } finally {
      setIsGreetingSaving(false);
    }
  }

  async function saveSummary(regenerate: boolean): Promise<void> {
    if (!canManageTenant || !persistedProfile || (!regenerate && !summary.trim())) {
      return;
    }
    setIsSummarySaving(true);
    setSummaryStatus(null);
    try {
      await saveProfile(regenerate ? { businessId, regenerateSummary: true } : { businessId, summary: summary.trim() });
      telemetry.track("web.agent.settings_saved", { businessId, setting: regenerate ? "summary_regenerated" : "summary" });
      setSummaryStatus(regenerate ? t("agent:fields.summary.regenerating") : null);
      if (regenerate) setAwaitingRewrite(true);
      else {
        toast.success(t("agent:actions.saved"));
        setIsSummaryOpen(false);
      }
    } catch {
      toast.error(t("agent:actions.saveFailed"));
    } finally {
      setIsSummarySaving(false);
    }
  }

  async function saveTransferNumber(): Promise<void> {
    if (!canManageTenant || !persistedProfile) {
      return;
    }

    const transferNumberResolution = resolveTransferNumberForSave({
      rawInputValue: transferNumberInputValue,
      validTransferNumber: transferNumber,
    });
    if (!transferNumberResolution.ok) {
      setTransferStatus(t(transferNumberResolution.errorKey));
      return;
    }

    setIsTransferSaving(true);
    setTransferStatus(null);
    try {
      await saveProfile({ businessId, transferNumber: transferNumberResolution.value });
      // Typing that started during the save is still unsaved.
      if (transferNumberRef.current === (transferNumberResolution.value ?? "")) transferNumberEdited.current = false;
      telemetry.track("web.agent.settings_saved", { businessId, setting: "transfer_number" });
      toast.success(t("agent:actions.saved"));
    } catch (error) {
      if (errorCode(error) === "transfer_country_unsupported") setTransferStatus(t("agent:fields.transferNumber.errors.countryUnsupported"));
      else toast.error(t("agent:actions.saveFailed"));
    } finally {
      setIsTransferSaving(false);
    }
  }

  async function saveAppointmentChangePolicy({
    allowCancel = allowAppointmentCancel,
    allowReschedule = allowAppointmentReschedule,
    verificationMode = appointmentChangeVerification,
  }: {
    allowCancel?: boolean;
    allowReschedule?: boolean;
    verificationMode?: AppointmentChangeVerificationMode;
  } = {}): Promise<void> {
    if (!canManageTenant || !persistedProfile) {
      return;
    }

    setIsAppointmentChangeSaving(true);
    try {
      await saveProfile({
        businessId,
        appointmentChangePolicy: buildAppointmentChangePolicyForSave({
          allowCancel,
          allowReschedule,
          verificationMode,
        }),
      });
      telemetry.track("web.agent.settings_saved", { businessId, setting: "appointment_change_policy" });
      toast.success(t("agent:actions.saved"));
    } catch {
      toast.error(t("agent:actions.saveFailed"));
    } finally {
      setIsAppointmentChangeSaving(false);
    }
  }

  async function saveTimezone(nextTimezone: string): Promise<void> {
    if (!canManageTenant) return;
    const previous = timezone;
    setTimezone(nextTimezone);
    setIsTimezoneSaving(true);
    try {
      // A refetch resets every unsaved draft on this page, so the saved settings only go stale.
      await saveProfile({ businessId, timezone: nextTimezone }, "none");
      telemetry.track("web.agent.settings_saved", { businessId, setting: "timezone" });
      toast.success(t("agent:actions.saved"));
    } catch {
      setTimezone(previous);
      toast.error(t("agent:actions.saveFailed"));
    } finally {
      setIsTimezoneSaving(false);
    }
  }

  async function saveCurrency(nextCurrency: string): Promise<void> {
    if (!canManageTenant) return;
    const previous = currency;
    setCurrency(nextCurrency);
    setIsCurrencySaving(true);
    try {
      await saveProfile({ businessId, currency: nextCurrency }, "none");
      // Service prices show in this currency.
      await queryClient.invalidateQueries({ queryKey: ["catalog", businessId] });
      telemetry.track("web.agent.settings_saved", { businessId, setting: "currency" });
      toast.success(t("agent:actions.saved"));
    } catch {
      setCurrency(previous);
      toast.error(t("agent:actions.saveFailed"));
    } finally {
      setIsCurrencySaving(false);
    }
  }

  async function saveBookingMode(nextMode: BookingMode): Promise<void> {
    if (!canManageTenant || !persistedProfile) return;
    setIsBookingModeSaving(true);
    try {
      await saveProfile({ businessId, bookingMode: nextMode });
      telemetry.track("web.agent.settings_saved", { businessId, setting: "booking_mode" });
      toast.success(t("agent:actions.saved"));
    } catch {
      toast.error(t("agent:actions.saveFailed"));
    } finally {
      setIsBookingModeSaving(false);
    }
  }

  async function saveVoice(nextVoice: ReceptionistVoice): Promise<boolean> {
    if (!canManageTenant || !persistedProfile) return false;
    setIsVoiceSaving(true);
    try {
      await saveProfile({ businessId, voice: nextVoice });
      // Only now: the dialog shows the current voice as in use, and a failed save keeps the pick.
      setVoice(nextVoice);
      telemetry.track("web.agent.settings_saved", { businessId, setting: "voice" });
      toast.success(t("agent:actions.saved"));
      return true;
    } catch {
      toast.error(t("agent:actions.saveFailed"));
      return false;
    } finally {
      setIsVoiceSaving(false);
    }
  }

  return (
    <div className="w-full overflow-y-auto pb-12">
      <div className="flex w-full flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-sm leading-snug font-medium">
            {t("agent:fields.defaults.title")}
          </h2>
          <Surface className="flex flex-col">
            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:fields.greeting.label")}</ItemTitle>
                <ItemDescription>{t("agent:fields.greeting.hint")}</ItemDescription>
              </ItemContent>
              <ItemActions className="w-full justify-end self-center sm:w-auto">
                <Button
                  aria-label={t("agent:actions.editField", { field: t("agent:fields.greeting.label") })}
                  disabled={isLoadingConfiguration || !persistedProfile || !canManageTenant}
                  onClick={() => {
                    setGreeting(persistedProfile?.greeting ?? "");
                    setIsGreetingOpen(true);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("agent:actions.edit")}
                </Button>
              </ItemActions>
              <Dialog onOpenChange={(open) => { if (!open && !isGreetingSaving) setIsGreetingOpen(false); }} open={isGreetingOpen}>
                <DialogContent className="flex flex-col gap-4">
                  <DialogHeader><DialogTitle>{t("agent:fields.greeting.label")}</DialogTitle></DialogHeader>
                  <Textarea
                    autoFocus
                    disabled={!canManageTenant || isGreetingSaving}
                    id="agent-greeting"
                    onChange={(event) => setGreeting(event.target.value)}
                    placeholder={t("agent:fields.greeting.placeholder")}
                    rows={3}
                    value={greeting}
                  />
                  <DialogFooter>
                    <Button disabled={isGreetingSaving} onClick={() => setIsGreetingOpen(false)} type="button" variant="outline">{t("agent:actions.cancel")}</Button>
                    <Button disabled={isGreetingSaving || !canManageTenant || !greeting.trim()} onClick={() => void saveGreeting()} type="button">
                      {isGreetingSaving ? t("agent:actions.saving") : t("agent:actions.save")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:fields.summary.label")}</ItemTitle>
                <ItemDescription>{t("agent:fields.summary.hint")}</ItemDescription>
                {summaryStatus ? <ItemDescription>{summaryStatus}</ItemDescription> : null}
              </ItemContent>
              <ItemActions className="w-full justify-end self-center sm:w-auto">
                <Button
                  aria-label={t("agent:actions.editField", { field: t("agent:fields.summary.label") })}
                  disabled={isLoadingConfiguration || !persistedProfile || !canManageTenant}
                  onClick={() => {
                    setSummary(savedSummary);
                    setSummaryStatus(null);
                    setIsSummaryOpen(true);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("agent:actions.edit")}
                </Button>
              </ItemActions>
              <Dialog onOpenChange={(open) => {
                if (open || isSummarySaving) return;
                setIsSummaryOpen(false);
                // Closing mid-typing skips to the end; the summary is already saved.
                if (typingTarget !== null) {
                  setTypedSummary(null);
                  setTypingTarget(null);
                  toast.success(t("agent:fields.summary.rewriteCompleted"));
                }
              }} open={isSummaryOpen}>
                <DialogContent className="flex flex-col gap-4">
                  <DialogHeader><DialogTitle>{t("agent:fields.summary.label")}</DialogTitle></DialogHeader>
                  <div className="relative overflow-hidden rounded-xl">
                    <Textarea
                      aria-busy={rewritingInDialog || undefined}
                      autoFocus
                      // The old text recedes while AI reads; the new text types in at full contrast.
                      className={cn("transition-opacity duration-300", isSummaryOpen && awaitingRewrite && "opacity-70")}
                      disabled={!canManageTenant || isSummarySaving}
                      id="agent-summary"
                      maxLength={2000}
                      onChange={(event) => setSummary(event.target.value)}
                      placeholder={t("agent:fields.summary.placeholder")}
                      readOnly={rewritingInDialog}
                      rows={6}
                      value={typedSummary ?? summary}
                    />
                    {isSummaryOpen && awaitingRewrite && !reduceMotion ? (
                      // A soft band sweeps down the text while AI reads the knowledge.
                      <motion.div
                        animate={{ top: ["-4rem", "100%"] }}
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 h-16 bg-linear-to-b from-transparent via-primary/15 to-transparent"
                        transition={{ duration: 1.6, ease: "linear", repeat: Infinity }}
                      />
                    ) : null}
                  </div>
                  {rewritingInDialog ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                      <Sparkles aria-hidden="true" className="size-4 animate-pulse" />
                      {t("agent:fields.summary.regenerating")}
                    </p>
                  ) : null}
                  <DialogFooter className="sm:justify-between">
                    {persistedProfile?.summarySource === "operator" ? (
                      <div className="flex flex-col gap-1">
                        <Button disabled={isSummarySaving || !canManageTenant || !canRewriteSummary || awaitingRewrite} onClick={() => void saveSummary(true)} type="button" variant="ghost">
                          {t("agent:fields.summary.regenerate")}
                        </Button>
                        {!canRewriteSummary ? <p className="text-xs text-muted-foreground">{t("agent:fields.summary.rewriteNeedsKnowledge")}</p> : null}
                      </div>
                    ) : <span className="hidden sm:block" />}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                      <Button disabled={isSummarySaving} onClick={() => setIsSummaryOpen(false)} type="button" variant="outline">{t("agent:actions.cancel")}</Button>
                      <Button disabled={isSummarySaving || rewritingInDialog || !canManageTenant || !summary.trim()} onClick={() => void saveSummary(false)} type="button">
                        {isSummarySaving ? t("agent:actions.saving") : t("agent:actions.save")}
                      </Button>
                    </div>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:fields.defaultLocale.label")}</ItemTitle>
                <ItemDescription>{t("agent:fields.defaultLocale.hint")}</ItemDescription>
              </ItemContent>
              <ItemActions className="w-full sm:w-auto">
                {isLoadingConfiguration ? (
                  <Skeleton className="h-10 w-full rounded-md sm:w-52" />
                ) : (
                  <Select
                    disabled={!canManageTenant || isLocaleSaving}
                    items={runtimeLocales.map((code) => ({ value: code, label: t(`common:callerLanguage.${code}`) }))}
                    onValueChange={(value) => {
                      const nextLocale = ((value as RuntimeLocale | null) || "en");
                      setDefaultLocale(nextLocale);
                      void (async () => {
                        if (!canManageTenant || !persistedProfile) {
                          return;
                        }

                        setIsLocaleSaving(true);
                        try {
                          await saveProfile({ businessId, defaultLocale: nextLocale });
                          telemetry.track("web.agent.settings_saved", { businessId, setting: "default_locale" });
                          toast.success(t("agent:actions.saved"));
                        } catch {
                          toast.error(t("agent:actions.saveFailed"));
                        } finally {
                          setIsLocaleSaving(false);
                        }
                      })();
                    }}
                    value={defaultLocale}
                  >
                    <SelectTrigger aria-label={t("agent:fields.defaultLocale.label")} className="w-full sm:w-52" id="agent-default-language" loading={isLocaleSaving}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {runtimeLocales.map((code) => <SelectItem key={code} value={code}>{t(`common:callerLanguage.${code}`)}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </ItemActions>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:fields.teamLocale.label")}</ItemTitle>
                <ItemDescription>{t("agent:fields.teamLocale.hint")}</ItemDescription>
              </ItemContent>
              <ItemActions className="w-full sm:w-auto">
                {isLoadingConfiguration ? (
                  <Skeleton className="h-10 w-full rounded-md sm:w-52" />
                ) : (
                  <Select
                    disabled={!canManageTenant || isTeamLocaleSaving}
                    items={[{ value: "default", label: t("agent:fields.teamLocale.sameAsCaller") }, ...runtimeLocales.map((code) => ({ value: code, label: t(`common:callerLanguage.${code}`) }))]}
                    onValueChange={(value) => {
                      const next = ((value as RuntimeLocale | "default" | null) || "default");
                      setTeamLocale(next);
                      void (async () => {
                        if (!canManageTenant || !persistedProfile) {
                          return;
                        }

                        setIsTeamLocaleSaving(true);
                        try {
                          await saveProfile({ businessId, teamLocale: next === "default" ? null : next });
                          telemetry.track("web.agent.settings_saved", { businessId, setting: "team_locale" });
                          toast.success(t("agent:actions.saved"));
                        } catch {
                          toast.error(t("agent:actions.saveFailed"));
                        } finally {
                          setIsTeamLocaleSaving(false);
                        }
                      })();
                    }}
                    value={teamLocale}
                  >
                    <SelectTrigger aria-label={t("agent:fields.teamLocale.label")} className="w-full sm:w-52" id="agent-team-language" loading={isTeamLocaleSaving}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="default">{t("agent:fields.teamLocale.sameAsCaller")}</SelectItem>
                        {runtimeLocales.map((code) => <SelectItem key={code} value={code}>{t(`common:callerLanguage.${code}`)}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </ItemActions>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:fields.voice.label")}</ItemTitle>
                <ItemDescription>{t("agent:fields.voice.summary", { voice: voiceName(voice), traits: voiceTraits(voice) })}</ItemDescription>
              </ItemContent>
              <ItemActions className="w-full sm:w-auto">
                {isLoadingConfiguration ? (
                  <Skeleton className="h-10 w-full rounded-md sm:w-52" />
                ) : (
                  <Button disabled={!persistedProfile || !canManageTenant} onClick={() => setVoiceDialogOpen(true)} type="button" variant="outline">{t("agent:fields.voice.change")}</Button>
                )}
              </ItemActions>
            </Item>

            <VoiceDialog current={voice} onOpenChange={setVoiceDialogOpen} onSave={saveVoice} open={voiceDialogOpen} preview={voicePreview} saving={isVoiceSaving} />

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:fields.timezone.label")}</ItemTitle>
                <ItemDescription>{t("agent:fields.timezone.hint")}</ItemDescription>
              </ItemContent>
              <ItemActions className="w-full min-w-0 sm:w-auto">
                {isLoadingConfiguration ? (
                  <Skeleton className="h-10 w-full rounded-md sm:w-56" />
                ) : (
                  <Combobox
                    disabled={isTimezoneSaving || !timezone || !canManageTenant}
                    isItemEqualToValue={(item: TimeZoneOption, value: TimeZoneOption) => item.id === value.id}
                    items={timeZoneItems}
                    itemToStringLabel={(zone: TimeZoneOption) => zone.label}
                    onValueChange={(zone: TimeZoneOption | null) => { if (zone && zone.id !== timezone) void saveTimezone(zone.id); }}
                    value={timeZoneGroups.flatMap((group) => group.zones).find((zone) => zone.id === timezone) ?? null}
                  >
                    <ComboboxTrigger aria-label={t("agent:fields.timezone.label")} className={COMBOBOX_TRIGGER_CLASS} id="agent-timezone" loading={isTimezoneSaving}>
                      <span className="min-w-0 flex-1 truncate text-left"><ComboboxValue /></span>
                    </ComboboxTrigger>
                    <ComboboxContent className="min-w-(--anchor-width)">
                      {/* Above the list, so the list doesn't paint over the input's focus ring. */}
                      <ComboboxInput className="relative z-10" placeholder={t("agent:fields.timezone.search")} showTrigger={false} />
                      <ComboboxEmpty>{t("agent:fields.timezone.noResults")}</ComboboxEmpty>
                      <ComboboxList>
                        {(group: TimeZoneItemGroup) => (
                          <ComboboxGroup items={group.items} key={group.value}>
                            {group.label ? <ComboboxLabel>{group.label}</ComboboxLabel> : null}
                            <ComboboxCollection>{(zone: TimeZoneOption) => <ComboboxItem key={zone.id} value={zone}>{zone.label}</ComboboxItem>}</ComboboxCollection>
                          </ComboboxGroup>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                )}
              </ItemActions>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:fields.currency.label")}</ItemTitle>
                <ItemDescription>{t("agent:fields.currency.hint")}</ItemDescription>
              </ItemContent>
              <ItemActions className="w-full min-w-0 sm:w-auto">
                {isLoadingConfiguration ? (
                  <Skeleton className="h-10 w-full rounded-md sm:w-56" />
                ) : (
                  <Combobox
                    disabled={isCurrencySaving || !currency || !canManageTenant}
                    isItemEqualToValue={(item: CurrencyOption, value: CurrencyOption) => item.id === value.id}
                    items={currencyItems}
                    itemToStringLabel={(option: CurrencyOption) => option.label}
                    onValueChange={(option: CurrencyOption | null) => { if (option && option.id !== currency) void saveCurrency(option.id); }}
                    value={currencyItems.find((option) => option.id === currency) ?? null}
                  >
                    <ComboboxTrigger aria-label={t("agent:fields.currency.label")} className={COMBOBOX_TRIGGER_CLASS} id="agent-currency" loading={isCurrencySaving}>
                      <span className="min-w-0 flex-1 truncate text-left"><ComboboxValue /></span>
                    </ComboboxTrigger>
                    <ComboboxContent className="min-w-(--anchor-width)">
                      <ComboboxInput className="relative z-10" placeholder={t("agent:fields.currency.search")} showTrigger={false} />
                      <ComboboxEmpty>{t("agent:fields.currency.noResults")}</ComboboxEmpty>
                      <ComboboxList>{(option: CurrencyOption) => <ComboboxItem key={option.id} value={option}>{option.label}</ComboboxItem>}</ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                )}
              </ItemActions>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:fields.transferNumber.label")}</ItemTitle>
                <ItemDescription>{t("agent:fields.transferNumber.hint")}</ItemDescription>
                <div className="pt-2">
                  {isLoadingConfiguration ? (
                    <Skeleton className="h-10 w-full rounded-md sm:w-72" />
                  ) : (
                    <div className="flex w-full min-w-0 sm:w-fit">
                      <PhoneCountrySelect ariaLabel={t("agent:fields.transferNumber.country")} className="w-20 rounded-r-none px-4 font-medium text-muted-foreground" countries={countries.filter((option) => isTransferCountry(option.code))} disabled={!canManageTenant} onChange={(next) => { transferNumberEdited.current = true; setTransferCountry(next as Country); setTransferNumber(""); setTransferNumberInputValue(""); setTransferStatus(null); }} value={transferCountry} />
                      <PhoneInput
                        className="rounded-l-none border-l-0 sm:w-40"
                        containerClassName="min-w-0 flex-1"
                        country={transferCountry}
                        disabled={!canManageTenant}
                        id="agent-transfer-number"
                        limitNationalDigits
                        locale={i18n.language}
                        maxLength={18}
                        onChange={(nextValue) => {
                          setTransferNumber(nextValue ?? "");
                          setTransferStatus(null);
                        }}
                        onRawValueChange={(nextRawValue) => {
                          transferNumberEdited.current = true;
                          setTransferNumberInputValue(nextRawValue);
                          setTransferStatus(null);
                          if (nextRawValue.trim().startsWith("+")) {
                            const inferred = inferPhoneCountry(nextRawValue, transferCountry);
                            if (inferred && inferred !== transferCountry) setTransferCountry(inferred as Country);
                          }
                        }}
                        {...(transferNumber ? { value: transferNumber } : {})}
                      />
                    </div>
                  )}
                </div>
                {transferStatus ? <ItemDescription className="text-destructive">{transferStatus}</ItemDescription> : null}
              </ItemContent>
              <ItemActions className="w-full justify-end self-center sm:w-auto">
                <Button
                  disabled={
                    isLoadingConfiguration ||
                    isTransferSaving ||
                    !persistedProfile ||
                    !canManageTenant
                  }
                  onClick={() => void saveTransferNumber()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isTransferSaving ? t("agent:actions.saving") : t("agent:actions.save")}
                </Button>
              </ItemActions>
            </Item>
          </Surface>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-sm leading-snug font-medium">
            {t("agent:booking.title")}
          </h2>
          <Surface className="flex flex-col">
            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:booking.mode.label")}</ItemTitle>
                <ItemDescription>{t(`agent:booking.mode.descriptions.${bookingMode}`)}</ItemDescription>
              </ItemContent>
              <ItemActions className="w-full sm:w-auto">
                {isLoadingConfiguration ? (
                  <Skeleton className="h-10 w-full rounded-md sm:w-48" />
                ) : (
                  <Select
                    disabled={isBookingModeSaving || !persistedProfile || !canManageTenant}
                    items={(["instant", "request", "off"] as const).map((mode) => ({ value: mode, label: t(`agent:booking.mode.options.${mode}`) }))}
                    onValueChange={(value) => {
                      const nextMode = normalizeBookingMode(value);
                      setBookingMode(nextMode);
                      void saveBookingMode(nextMode);
                    }}
                    value={bookingMode}
                  >
                    <SelectTrigger aria-label={t("agent:booking.mode.label")} className="w-full sm:w-48" id="agent-booking-mode" loading={isBookingModeSaving}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="instant">{t("agent:booking.mode.options.instant")}</SelectItem>
                        <SelectItem value="request">{t("agent:booking.mode.options.request")}</SelectItem>
                        <SelectItem value="off">{t("agent:booking.mode.options.off")}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </ItemActions>
            </Item>
            <BusinessHoursSection bookingMode={bookingMode} businessId={businessId} canManage={canManageTenant} />
          </Surface>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-sm leading-snug font-medium">
            {t("agent:appointmentChanges.title")}
          </h2>
          <Surface className="flex flex-col">
            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:appointmentChanges.allowCancel.label")}</ItemTitle>
                <ItemDescription>
                  {t("agent:appointmentChanges.allowCancel.hint")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {isLoadingConfiguration ? (
                  <Skeleton className="h-5 w-8 rounded-full" />
                ) : (
                  <Switch
                    aria-label={t("agent:appointmentChanges.allowCancel.label")}
                    checked={allowAppointmentCancel}
                    disabled={isAppointmentChangeSaving || !persistedProfile || !canManageTenant}
                    onCheckedChange={(checked) => {
                      setAllowAppointmentCancel(checked);
                      void saveAppointmentChangePolicy({ allowCancel: checked });
                    }}
                  />
                )}
              </ItemActions>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:appointmentChanges.allowReschedule.label")}</ItemTitle>
                <ItemDescription>
                  {t("agent:appointmentChanges.allowReschedule.hint")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {isLoadingConfiguration ? (
                  <Skeleton className="h-5 w-8 rounded-full" />
                ) : (
                  <Switch
                    aria-label={t("agent:appointmentChanges.allowReschedule.label")}
                    checked={allowAppointmentReschedule}
                    disabled={isAppointmentChangeSaving || !persistedProfile || !canManageTenant}
                    onCheckedChange={(checked) => {
                      setAllowAppointmentReschedule(checked);
                      void saveAppointmentChangePolicy({ allowReschedule: checked });
                    }}
                  />
                )}
              </ItemActions>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:appointmentChanges.verification.label")}</ItemTitle>
                <ItemDescription>
                  {t(`agent:appointmentChanges.verification.descriptions.${appointmentChangeVerification}`)}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="w-full sm:w-auto">
                {isLoadingConfiguration ? (
                  <Skeleton className="h-10 w-full rounded-md sm:w-56" />
                ) : (
                  <Select
                    disabled={isAppointmentChangeSaving || !persistedProfile || !canManageTenant}
                    items={verificationChoices.map((mode) => ({ value: mode, label: t(`agent:appointmentChanges.verification.options.${mode}`) }))}
                    onValueChange={(value) => {
                      const nextMode = savedVerificationMode(value);
                      setAppointmentChangeVerification(nextMode);
                      void saveAppointmentChangePolicy({ verificationMode: nextMode });
                    }}
                    value={appointmentChangeVerification}
                  >
                    <SelectTrigger aria-label={t("agent:appointmentChanges.verification.label")} className="w-full sm:w-56" id="agent-appointment-change-verification" loading={isAppointmentChangeSaving}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {verificationChoices.map((mode) => <SelectItem key={mode} value={mode}>{t(`agent:appointmentChanges.verification.options.${mode}`)}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </ItemActions>
            </Item>
          </Surface>
        </section>
      </div>
    </div>
  );
}

export function LiveAgentBasicSettingsSurface() {
  const { business } = useActiveBusiness();
  return <AgentBasicSettingsPage businessId={business?.businessId ?? ""} canManageTenant={Boolean(business && ["business_owner", "business_admin"].includes(business.role))} />;
}
