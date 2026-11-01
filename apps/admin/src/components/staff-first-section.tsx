"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_STAFF_FIRST_RING_SECONDS, isTransferCountry, normalizeStaffFirstMode, STAFF_FIRST_MESSAGE_MAX_LENGTH, staffFirstModes, staffFirstRingSeconds, type RuntimeLocale, type StaffFirstMode } from "@lobbystack/shared";
import type { Country } from "react-phone-number-input/input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { useTelemetry } from "@/components/product-analytics";
import { PhoneCountrySelect } from "@/components/phone-country-select";
import { errorCode } from "@/lib/checkout-errors";
import { getDefaultTransferCountry, getPhoneCountryOptions, inferPhoneCountry } from "@/lib/phone";

export type StaffFirstProfile = {
  staffFirstMode?: string;
  staffFirstNumber?: string | null;
  staffFirstRingSeconds?: number;
  staffFirstMessage?: string | null;
  staffFirstHandoverMessage?: string | null;
  transferNumber?: string | null;
};

export type StaffFirstPatch = { staffFirstMode: StaffFirstMode; staffFirstNumber: string | null; staffFirstRingSeconds: number; staffFirstMessage: string | null; staffFirstHandoverMessage: string | null };

const itemClassName = "rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0";

const saveErrors: Record<string, string> = {
  staff_first_number_required: "agent:staffFirst.errors.numberRequired",
  staff_first_number_own_line: "agent:staffFirst.errors.ownLine",
  staff_first_plan_required: "agent:staffFirst.unavailable.plan",
  staff_first_carrier_unsupported: "agent:staffFirst.unavailable.carrier",
  transfer_country_unsupported: "agent:fields.transferNumber.errors.countryUnsupported",
  transfer_number_invalid: "agent:fields.transferNumber.errors.invalid",
  trial_transfer_locked: "agent:staffFirst.errors.trialLocked",
};

/** Staff answers first: which phone rings before the receptionist answers, and for how long. */
export function StaffFirstSection({ businessId, block, canManage, defaultLocale, isLoading, onSave, profile }: {
  businessId: string;
  block: "plan" | "carrier" | null;
  canManage: boolean;
  defaultLocale: RuntimeLocale;
  isLoading: boolean;
  onSave: (patch: StaffFirstPatch) => Promise<void>;
  profile: StaffFirstProfile | null | undefined;
}) {
  const { i18n, t } = useTranslation(["agent", "common"]);
  const telemetry = useTelemetry();
  const [mode, setMode] = useState<StaffFirstMode>("never");
  const [number, setNumber] = useState("");
  const [rawNumber, setRawNumber] = useState("");
  const [ringSeconds, setRingSeconds] = useState<number>(DEFAULT_STAFF_FIRST_RING_SECONDS);
  const [message, setMessage] = useState("");
  const [handoverMessage, setHandoverMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const defaultCountry = getDefaultTransferCountry(i18n.language) as Country;
  const countries = useMemo(() => getPhoneCountryOptions(i18n.language).filter((option) => isTransferCountry(option.code)), [i18n.language]);
  const [country, setCountry] = useState<Country>(defaultCountry);
  const syncedBusinessId = useRef<string | null>(null);

  // Starts from the saved settings, with the transfer number filled in until a staff phone is saved. A refetch doesn't undo an edit.
  useEffect(() => {
    if (!profile || syncedBusinessId.current === businessId) return;
    syncedBusinessId.current = businessId;
    const phone = profile.staffFirstNumber ?? profile.transferNumber ?? "";
    setMode(normalizeStaffFirstMode(profile.staffFirstMode));
    setNumber(phone);
    setRawNumber(phone);
    setCountry((inferPhoneCountry(phone, defaultCountry) ?? defaultCountry) as Country);
    setRingSeconds(profile.staffFirstRingSeconds ?? DEFAULT_STAFF_FIRST_RING_SECONDS);
    setMessage(profile.staffFirstMessage ?? "");
    setHandoverMessage(profile.staffFirstHandoverMessage ?? "");
  }, [businessId, defaultCountry, profile]);

  const savedMode = normalizeStaffFirstMode(profile?.staffFirstMode);
  // A business that lost access can still turn the setting off.
  const disabled = !canManage || (block !== null && savedMode === "never");
  const typedNumber = rawNumber.trim();

  async function save() {
    if (typedNumber && !number) {
      setStatus(t("agent:fields.transferNumber.errors.invalid"));
      return;
    }
    if (mode !== "never" && !typedNumber) {
      setStatus(t("agent:staffFirst.errors.numberRequired"));
      return;
    }
    setIsSaving(true);
    setStatus(null);
    try {
      await onSave({ staffFirstMode: mode, staffFirstNumber: typedNumber ? number : null, staffFirstRingSeconds: ringSeconds, staffFirstMessage: message.trim() || null, staffFirstHandoverMessage: handoverMessage.trim() || null });
      telemetry.track("web.agent.settings_saved", { businessId, setting: "staff_first" });
      toast.success(t("agent:actions.saved"));
    } catch (error) {
      const key = saveErrors[errorCode(error) ?? ""];
      if (key) setStatus(t(key));
      else toast.error(t("agent:actions.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-sm leading-snug font-medium">{t("agent:staffFirst.title")}</h2>
      <Surface className="flex flex-col">
        <Item className={itemClassName} variant="default">
          <ItemContent>
            <ItemTitle>{t("agent:staffFirst.mode.label")}</ItemTitle>
            <ItemDescription>{block ? t(`agent:staffFirst.unavailable.${block}`) : t("agent:staffFirst.mode.hint")}</ItemDescription>
          </ItemContent>
          <ItemActions className="w-full sm:w-auto">
            {isLoading ? <Skeleton className="h-9 w-full rounded-4xl sm:w-48" /> : (
              <Select disabled={disabled} items={staffFirstModes.map((value) => ({ value, label: t(`agent:staffFirst.mode.options.${value}`) }))} onValueChange={(next) => { if (next) setMode(next as StaffFirstMode); }} value={mode}>
                <SelectTrigger aria-label={t("agent:staffFirst.mode.label")} className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{staffFirstModes.map((value) => <SelectItem key={value} value={value}>{t(`agent:staffFirst.mode.options.${value}`)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            )}
          </ItemActions>
        </Item>
        {mode === "never" ? null : (
          <>
            <Item className={itemClassName} variant="default">
              <ItemContent>
                <ItemTitle>{t("agent:staffFirst.number.label")}</ItemTitle>
                <ItemDescription>{t("agent:staffFirst.number.hint")}</ItemDescription>
                <div className="flex w-full min-w-0 pt-2 sm:w-fit">
                  <PhoneCountrySelect ariaLabel={t("agent:fields.transferNumber.country")} className="w-20 rounded-r-none px-4 font-medium text-muted-foreground" countries={countries} disabled={!canManage} onChange={(next) => { setCountry(next as Country); setNumber(""); setRawNumber(""); setStatus(null); }} value={country} />
                  <PhoneInput
                    aria-label={t("agent:staffFirst.number.label")}
                    className="rounded-l-none border-l-0 sm:w-40"
                    containerClassName="min-w-0 flex-1"
                    country={country}
                    disabled={!canManage}
                    id="agent-staff-first-number"
                    limitNationalDigits
                    locale={i18n.language}
                    maxLength={18}
                    onChange={(next) => { setNumber(next ?? ""); setStatus(null); }}
                    onRawValueChange={(next) => {
                      setRawNumber(next);
                      setStatus(null);
                      if (next.trim().startsWith("+")) {
                        const inferred = inferPhoneCountry(next, country);
                        if (inferred && inferred !== country) setCountry(inferred as Country);
                      }
                    }}
                    {...(number ? { value: number } : {})}
                  />
                </div>
              </ItemContent>
            </Item>
            <Item className={itemClassName} variant="default">
              <ItemContent>
                <ItemTitle>{t("agent:staffFirst.ring.label")}</ItemTitle>
                <ItemDescription>{t("agent:staffFirst.ring.hint")}</ItemDescription>
              </ItemContent>
              <ItemActions className="w-full sm:w-auto">
                <Select disabled={!canManage} items={staffFirstRingSeconds.map((value) => ({ value: String(value), label: t("agent:staffFirst.ring.seconds", { count: value }) }))} onValueChange={(next) => { if (next) setRingSeconds(Number(next)); }} value={String(ringSeconds)}>
                  <SelectTrigger aria-label={t("agent:staffFirst.ring.label")} className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>{staffFirstRingSeconds.map((value) => <SelectItem key={value} value={String(value)}>{t("agent:staffFirst.ring.seconds", { count: value })}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              </ItemActions>
            </Item>
            <Item className={itemClassName} variant="default">
              <ItemContent>
                <ItemTitle>{t("agent:staffFirst.message.label")}</ItemTitle>
                <ItemDescription>{defaultLocale === "sr" ? t("agent:staffFirst.message.noSerbianVoice") : t("agent:staffFirst.message.hint")}</ItemDescription>
                <Textarea aria-label={t("agent:staffFirst.message.label")} className="mt-2" disabled={!canManage} maxLength={STAFF_FIRST_MESSAGE_MAX_LENGTH} onChange={(event) => setMessage(event.target.value)} rows={2} value={message} />
              </ItemContent>
            </Item>
            <Item className={itemClassName} variant="default">
              <ItemContent>
                <ItemTitle>{t("agent:staffFirst.handover.label")}</ItemTitle>
                <ItemDescription>{defaultLocale === "sr" ? t("agent:staffFirst.message.noSerbianVoice") : t("agent:staffFirst.handover.hint")}</ItemDescription>
                <Textarea aria-label={t("agent:staffFirst.handover.label")} className="mt-2" disabled={!canManage} maxLength={STAFF_FIRST_MESSAGE_MAX_LENGTH} onChange={(event) => setHandoverMessage(event.target.value)} rows={2} value={handoverMessage} />
              </ItemContent>
            </Item>
          </>
        )}
        {block && disabled ? null : (
          <div className="flex items-center justify-end gap-3 p-4">
            {status ? <p className="text-sm text-destructive">{status}</p> : null}
            <Button aria-label={t("agent:staffFirst.save")} disabled={isLoading || isSaving || disabled || !profile} onClick={() => void save()} size="sm" type="button" variant="outline">
              {isSaving ? t("agent:actions.saving") : t("agent:actions.save")}
            </Button>
          </div>
        )}
      </Surface>
    </section>
  );
}
