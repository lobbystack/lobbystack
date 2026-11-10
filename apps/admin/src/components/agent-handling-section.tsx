"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { appointmentChangeVerificationModes, isTransferCountry, normalizeBookingMode, type AppointmentChangePolicy, type AppointmentChangeVerificationMode, type BookingMode } from "@lobbystack/shared";
import type { Country } from "react-phone-number-input/input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { PhoneCountrySelect } from "@/components/phone-country-select";
import { useTelemetry } from "@/components/product-analytics";
import { StaffFirstSection } from "@/components/staff-first-section";
import { settingRowClassName } from "@/components/text-setting-row";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { useAgentSettingsQuery, useSaveAgent } from "@/hooks/use-agent-settings";
import { errorCode } from "@/lib/checkout-errors";
import { getDefaultTransferCountry, getPhoneCountryOptions, inferPhoneCountry } from "@/lib/phone";

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

// The checks the dashboard offers. An agent saved as operator_only keeps
// that option in the select while it's the saved mode.
const offeredVerificationModes: AppointmentChangeVerificationMode[] = ["phone_match_and_facts", "otp_required", "passcode_required"];

function savedVerificationMode(value: unknown): AppointmentChangeVerificationMode {
  return (appointmentChangeVerificationModes as readonly unknown[]).includes(value) ? value as AppointmentChangeVerificationMode : "phone_match_and_facts";
}

type AgentSectionProps = { businessId: string; agentId: string; canManage: boolean };

/** Calls and booking: an agent's transfer number, staff answers first, booking mode and appointment changes. */
export function AgentHandlingSection({ agentId, businessId, canManage }: AgentSectionProps) {
  const { i18n, t } = useTranslation(["agent", "common"]);
  const telemetry = useTelemetry();
  const query = useAgentSettingsQuery(businessId, agentId);
  const save = useSaveAgent(businessId, agentId);
  const configuration = query.data;
  const persistedProfile = configuration?.profile;
  const isLoadingConfiguration = !businessId || !agentId || query.isLoading;

  const [transferNumber, setTransferNumber] = useState("");
  const [transferNumberInputValue, setTransferNumberInputValue] = useState("");
  const defaultTransferCountry = getDefaultTransferCountry(i18n.language) as Country;
  const countries = useMemo(() => getPhoneCountryOptions(i18n.language), [i18n.language]);
  const [transferCountry, setTransferCountry] = useState<Country>(defaultTransferCountry);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [isTransferSaving, setIsTransferSaving] = useState(false);
  const [allowAppointmentCancel, setAllowAppointmentCancel] = useState(true);
  const [allowAppointmentReschedule, setAllowAppointmentReschedule] = useState(true);
  const [appointmentChangeVerification, setAppointmentChangeVerification] = useState<AppointmentChangeVerificationMode>("phone_match_and_facts");
  const [isAppointmentChangeSaving, setIsAppointmentChangeSaving] = useState(false);
  const [bookingMode, setBookingMode] = useState<BookingMode>("instant");
  const [isBookingModeSaving, setIsBookingModeSaving] = useState(false);

  // Every save refetches the settings, and a refetch that lands while someone
  // is typing must not undo their edit, so the transfer number only takes the
  // saved value while nobody has edited it since it was saved. Switching
  // business or agent keeps the page mounted, and none of it carries over.
  const syncedScope = useRef(`${businessId}:${agentId}`);
  const transferNumberRef = useRef(transferNumber);
  transferNumberRef.current = transferNumber;
  const transferNumberEdited = useRef(false);
  useEffect(() => {
    const scope = `${businessId}:${agentId}`;
    if (syncedScope.current !== scope) {
      syncedScope.current = scope;
      transferNumberEdited.current = false;
    }
    const profile = configuration?.profile;
    if (!profile) return;
    if (!transferNumberEdited.current) {
      setTransferNumber(profile.transferNumber ?? "");
      setTransferNumberInputValue(profile.transferNumber ?? "");
    }
    setBookingMode(normalizeBookingMode(profile.bookingMode));
    const appointmentChangePolicy = profile.appointmentChangePolicy as AppointmentChangePolicy | null;
    setAllowAppointmentCancel(appointmentChangePolicy?.allowCancel ?? true);
    setAllowAppointmentReschedule(appointmentChangePolicy?.allowReschedule ?? true);
    setAppointmentChangeVerification(savedVerificationMode(appointmentChangePolicy?.verificationMode));
  }, [agentId, businessId, configuration]);
  const verificationChoices = offeredVerificationModes.includes(appointmentChangeVerification) ? offeredVerificationModes : [...offeredVerificationModes, appointmentChangeVerification];

  // The saved number's country, else the locale's.
  const savedTransferNumber = configuration?.profile?.transferNumber;
  useEffect(() => {
    // Changing the country clears the input, so a refetch leaves a number being typed alone.
    if (transferNumberEdited.current && transferNumberRef.current !== (savedTransferNumber ?? "")) return;
    setTransferCountry((inferPhoneCountry(savedTransferNumber, defaultTransferCountry) ?? defaultTransferCountry) as Country);
  }, [defaultTransferCountry, savedTransferNumber]);

  useEffect(() => {
    if (!transferStatus) return;
    const timeoutId = window.setTimeout(() => setTransferStatus(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [transferStatus]);

  async function saveTransferNumber(): Promise<void> {
    if (!canManage || !persistedProfile) return;
    const resolution = resolveTransferNumberForSave({ rawInputValue: transferNumberInputValue, validTransferNumber: transferNumber });
    if (!resolution.ok) {
      setTransferStatus(t(resolution.errorKey));
      return;
    }
    setIsTransferSaving(true);
    setTransferStatus(null);
    try {
      await save({ transferNumber: resolution.value });
      // Typing that started during the save is still unsaved.
      if (transferNumberRef.current === (resolution.value ?? "")) transferNumberEdited.current = false;
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
  }: { allowCancel?: boolean; allowReschedule?: boolean; verificationMode?: AppointmentChangeVerificationMode } = {}): Promise<void> {
    if (!canManage || !persistedProfile) return;
    setIsAppointmentChangeSaving(true);
    try {
      await save({ appointmentChangePolicy: buildAppointmentChangePolicyForSave({ allowCancel, allowReschedule, verificationMode }) });
      telemetry.track("web.agent.settings_saved", { businessId, setting: "appointment_change_policy" });
      toast.success(t("agent:actions.saved"));
    } catch {
      toast.error(t("agent:actions.saveFailed"));
    } finally {
      setIsAppointmentChangeSaving(false);
    }
  }

  async function saveBookingMode(nextMode: BookingMode): Promise<void> {
    if (!canManage || !persistedProfile) return;
    setIsBookingModeSaving(true);
    try {
      await save({ bookingMode: nextMode });
      telemetry.track("web.agent.settings_saved", { businessId, setting: "booking_mode" });
      toast.success(t("agent:actions.saved"));
    } catch {
      toast.error(t("agent:actions.saveFailed"));
    } finally {
      setIsBookingModeSaving(false);
    }
  }

  return (
    <div aria-busy={isLoadingConfiguration || undefined} className="flex w-full flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm leading-snug font-medium">{t("agent:transfers.title")}</h2>
        <Surface className="flex flex-col">
          <Item className={settingRowClassName} variant="default">
            <ItemContent>
              <ItemTitle>{t("agent:fields.transferNumber.label")}</ItemTitle>
              <ItemDescription>{t("agent:fields.transferNumber.hint")}</ItemDescription>
              <div className="pt-2">
                {isLoadingConfiguration ? (
                  <Skeleton className="h-10 w-full rounded-md sm:w-72" />
                ) : (
                  <div className="flex w-full min-w-0 sm:w-fit">
                    <PhoneCountrySelect ariaLabel={t("agent:fields.transferNumber.country")} className="rounded-r-none px-4 font-medium text-muted-foreground" countries={countries.filter((option) => isTransferCountry(option.code))} disabled={!canManage} onChange={(next) => { transferNumberEdited.current = true; setTransferCountry(next as Country); setTransferNumber(""); setTransferNumberInputValue(""); setTransferStatus(null); }} value={transferCountry} />
                    <PhoneInput
                      className="rounded-l-none border-l-0 sm:w-40"
                      containerClassName="min-w-0 flex-1"
                      country={transferCountry}
                      disabled={!canManage}
                      id="agent-transfer-number"
                      limitNationalDigits
                      locale={i18n.language}
                      maxLength={18}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" || isLoadingConfiguration || isTransferSaving || !persistedProfile || !canManage) return;
                        event.preventDefault();
                        void saveTransferNumber();
                      }}
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
              <Button disabled={isLoadingConfiguration || isTransferSaving || !persistedProfile || !canManage} onClick={() => void saveTransferNumber()} size="sm" type="button" variant="outline">
                {isTransferSaving ? t("agent:actions.saving") : t("agent:actions.save")}
              </Button>
            </ItemActions>
          </Item>
        </Surface>
      </section>

      <StaffFirstSection block={configuration?.staffFirstBlock ?? null} businessId={businessId} canManage={canManage} defaultLocale={configuration?.business?.defaultLocale ?? "en"} isLoading={isLoadingConfiguration} key={agentId} onSave={(patch) => save(patch)} profile={persistedProfile} />

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm leading-snug font-medium">{t("agent:booking.title")}</h2>
        <Surface className="flex flex-col">
          <Item className={settingRowClassName} variant="default">
            <ItemContent>
              <ItemTitle>{t("agent:booking.mode.label")}</ItemTitle>
              <ItemDescription>{t(`agent:booking.mode.descriptions.${bookingMode}`)}</ItemDescription>
            </ItemContent>
            <ItemActions className="w-full sm:w-auto">
              {isLoadingConfiguration ? (
                <Skeleton className="h-10 w-full rounded-md sm:w-48" />
              ) : (
                <Select
                  disabled={isBookingModeSaving || !persistedProfile || !canManage}
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
        </Surface>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm leading-snug font-medium">{t("agent:appointmentChanges.title")}</h2>
        <Surface className="flex flex-col">
          <Item className={settingRowClassName} variant="default">
            <ItemContent>
              <ItemTitle>{t("agent:appointmentChanges.allowCancel.label")}</ItemTitle>
              <ItemDescription>{t("agent:appointmentChanges.allowCancel.hint")}</ItemDescription>
            </ItemContent>
            <ItemActions>
              {isLoadingConfiguration ? (
                <Skeleton className="h-5 w-8 rounded-full" />
              ) : (
                <Switch
                  aria-label={t("agent:appointmentChanges.allowCancel.label")}
                  checked={allowAppointmentCancel}
                  disabled={isAppointmentChangeSaving || !persistedProfile || !canManage}
                  onCheckedChange={(checked) => {
                    setAllowAppointmentCancel(checked);
                    void saveAppointmentChangePolicy({ allowCancel: checked });
                  }}
                />
              )}
            </ItemActions>
          </Item>

          <Item className={settingRowClassName} variant="default">
            <ItemContent>
              <ItemTitle>{t("agent:appointmentChanges.allowReschedule.label")}</ItemTitle>
              <ItemDescription>{t("agent:appointmentChanges.allowReschedule.hint")}</ItemDescription>
            </ItemContent>
            <ItemActions>
              {isLoadingConfiguration ? (
                <Skeleton className="h-5 w-8 rounded-full" />
              ) : (
                <Switch
                  aria-label={t("agent:appointmentChanges.allowReschedule.label")}
                  checked={allowAppointmentReschedule}
                  disabled={isAppointmentChangeSaving || !persistedProfile || !canManage}
                  onCheckedChange={(checked) => {
                    setAllowAppointmentReschedule(checked);
                    void saveAppointmentChangePolicy({ allowReschedule: checked });
                  }}
                />
              )}
            </ItemActions>
          </Item>

          <Item className={settingRowClassName} variant="default">
            <ItemContent>
              <ItemTitle>{t("agent:appointmentChanges.verification.label")}</ItemTitle>
              <ItemDescription>{t(`agent:appointmentChanges.verification.descriptions.${appointmentChangeVerification}`)}</ItemDescription>
            </ItemContent>
            <ItemActions className="w-full sm:w-auto">
              {isLoadingConfiguration ? (
                <Skeleton className="h-10 w-full rounded-md sm:w-56" />
              ) : (
                <Select
                  disabled={isAppointmentChangeSaving || !persistedProfile || !canManage}
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
  );
}
