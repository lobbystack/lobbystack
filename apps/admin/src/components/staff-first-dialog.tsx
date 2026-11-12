"use client";

import { useMemo, useState } from "react";
import { DEFAULT_STAFF_FIRST_RING_SECONDS, isTransferCountry, normalizeStaffFirstMode, STAFF_FIRST_MESSAGE_MAX_LENGTH, staffFirstModes, staffFirstRingSeconds, type RuntimeLocale, type StaffFirstMode } from "@lobbystack/shared";
import type { Country } from "react-phone-number-input/input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Item, ItemContent, ItemDescription } from "@/components/ui/item";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/tabs";
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

const saveErrors: Record<string, string> = {
  staff_first_number_required: "agent:staffFirst.errors.numberRequired",
  staff_first_number_own_line: "agent:staffFirst.errors.ownLine",
  staff_first_plan_required: "agent:staffFirst.unavailable.plan",
  staff_first_carrier_unsupported: "agent:staffFirst.unavailable.carrier",
  staff_first_not_configured: "agent:staffFirst.unavailable.setup",
  transfer_country_unsupported: "agent:fields.transferNumber.errors.countryUnsupported",
  transfer_number_invalid: "agent:fields.transferNumber.errors.invalid",
  trial_transfer_locked: "agent:staffFirst.errors.trialLocked",
};

/** What happens to a call with each option. Always reads as the setting's hint, which describes it. */
const MODE_EFFECT_KEYS = {
  never: "agent:staffFirst.mode.effect.never",
  business_hours: "agent:staffFirst.mode.effect.business_hours",
  always: "agent:staffFirst.mode.hint",
} as const satisfies Record<StaffFirstMode, string>;

type Draft = { mode: StaffFirstMode; number: string; rawNumber: string; country: Country; ringSeconds: number; message: string; handoverMessage: string };

/** The saved settings as the dialog's fields, with the transfer number filled in until a staff phone is saved. */
function draftFrom(profile: StaffFirstProfile, defaultCountry: Country): Draft {
  const phone = profile.staffFirstNumber ?? profile.transferNumber ?? "";
  return {
    mode: normalizeStaffFirstMode(profile.staffFirstMode),
    number: phone,
    rawNumber: phone,
    country: (inferPhoneCountry(phone, defaultCountry) ?? defaultCountry) as Country,
    ringSeconds: profile.staffFirstRingSeconds ?? DEFAULT_STAFF_FIRST_RING_SECONDS,
    message: profile.staffFirstMessage ?? "",
    handoverMessage: profile.staffFirstHandoverMessage ?? "",
  };
}

/**
 * The whole Staff answers first setting in a dialog: when the team's phone
 * rings, which phone, for how long, and the two messages. The agent page and
 * Home's phone card both open it. Each opening starts from `profile`, the
 * saved settings; until they load, the fields wait as placeholders. A save
 * that succeeds closes the dialog; a failed one says why inside it.
 */
export function StaffFirstDialog({ businessId, defaultLocale, onOpenChange, onSave, open, profile }: {
  businessId: string;
  defaultLocale: RuntimeLocale;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: StaffFirstPatch) => Promise<void>;
  open: boolean;
  profile: StaffFirstProfile | null | undefined;
}) {
  const { i18n, t } = useTranslation(["agent", "common"]);
  const telemetry = useTelemetry();
  const defaultCountry = getDefaultTransferCountry(i18n.language) as Country;
  const countries = useMemo(() => getPhoneCountryOptions(i18n.language).filter((option) => isTransferCountry(option.code)), [i18n.language]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Each opening starts over from the saved settings, once they're here. A refetch while it's open keeps the edits,
  // and closing keeps the fields in place while the dialog animates out.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(profile ? draftFrom(profile, defaultCountry) : null);
      setStatus(null);
    }
  } else if (open && profile && !draft) {
    setDraft(draftFrom(profile, defaultCountry));
  }

  const update = (patch: Partial<Draft>) => { setDraft((current) => current ? { ...current, ...patch } : current); setStatus(null); };
  const serbian = defaultLocale === "sr";

  async function save() {
    if (!draft) return;
    const typedNumber = draft.rawNumber.trim();
    if (typedNumber && !draft.number) {
      setStatus(t("agent:fields.transferNumber.errors.invalid"));
      return;
    }
    if (draft.mode !== "never" && !typedNumber) {
      setStatus(t("agent:staffFirst.errors.numberRequired"));
      return;
    }
    setIsSaving(true);
    setStatus(null);
    try {
      await onSave({ staffFirstMode: draft.mode, staffFirstNumber: typedNumber ? draft.number : null, staffFirstRingSeconds: draft.ringSeconds, staffFirstMessage: draft.message.trim() || null, staffFirstHandoverMessage: draft.handoverMessage.trim() || null });
      onOpenChange(false);
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
    <Dialog onOpenChange={(next) => { if (!isSaving) onOpenChange(next); }} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle>{t("agent:staffFirst.mode.label")}</DialogTitle>
        </DialogHeader>
        {/* The padding keeps the focus rings clear of the scroll edge. */}
        <div className="-m-1 min-h-0 overflow-x-hidden overflow-y-auto p-1">
          {!draft ? (
            <div aria-busy="true" className="flex flex-col gap-3" data-slot="staff-first-dialog-skeleton">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-9 w-full rounded-full" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : (
            <FieldGroup>
              <Field>
                <FieldLabel id="agent-staff-first-mode-label">{t("agent:staffFirst.mode.when")}</FieldLabel>
                <SegmentedControl aria-describedby="agent-staff-first-mode-effect" aria-labelledby="agent-staff-first-mode-label" onValueChange={(next: StaffFirstMode) => update({ mode: next })} value={draft.mode}>
                  {staffFirstModes.map((value) => <SegmentedControlItem key={value} value={value}>{t(`agent:staffFirst.mode.options.${value}`)}</SegmentedControlItem>)}
                </SegmentedControl>
                {/* What happens to a call with the chosen option, so Off isn't an empty dialog. */}
                <Item size="sm" variant="muted">
                  <ItemContent><ItemDescription aria-live="polite" id="agent-staff-first-mode-effect">{t(MODE_EFFECT_KEYS[draft.mode])}</ItemDescription></ItemContent>
                </Item>
              </Field>
              {draft.mode === "never" ? null : (
                <>
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="agent-staff-first-number">{t("agent:staffFirst.number.label")}</FieldLabel>
                      <FieldDescription>{t("agent:staffFirst.number.hint")}</FieldDescription>
                    </FieldContent>
                    <div className="flex w-full min-w-0">
                      <PhoneCountrySelect ariaLabel={t("agent:fields.transferNumber.country")} className="rounded-r-none px-4 font-medium text-muted-foreground" countries={countries} onChange={(next) => update({ country: next as Country, number: "", rawNumber: "" })} value={draft.country} />
                      <PhoneInput
                        aria-label={t("agent:staffFirst.number.label")}
                        className="rounded-l-none border-l-0"
                        containerClassName="min-w-0 flex-1"
                        country={draft.country}
                        id="agent-staff-first-number"
                        limitNationalDigits
                        locale={i18n.language}
                        maxLength={18}
                        onChange={(next) => update({ number: next ?? "" })}
                        onRawValueChange={(next) => {
                          const inferred = next.trim().startsWith("+") ? inferPhoneCountry(next, draft.country) : null;
                          update({ rawNumber: next, ...(inferred && inferred !== draft.country ? { country: inferred as Country } : {}) });
                        }}
                        {...(draft.number ? { value: draft.number } : {})}
                      />
                    </div>
                  </Field>
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="agent-staff-first-ring">{t("agent:staffFirst.ring.label")}</FieldLabel>
                      <FieldDescription>{t("agent:staffFirst.ring.hint")}</FieldDescription>
                    </FieldContent>
                    <Select items={staffFirstRingSeconds.map((value) => ({ value: String(value), label: t("agent:staffFirst.ring.seconds", { count: value }) }))} onValueChange={(next) => { if (next) update({ ringSeconds: Number(next) }); }} value={String(draft.ringSeconds)}>
                      <SelectTrigger aria-label={t("agent:staffFirst.ring.label")} className="w-full" id="agent-staff-first-ring"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectGroup>{staffFirstRingSeconds.map((value) => <SelectItem key={value} value={String(value)}>{t("agent:staffFirst.ring.seconds", { count: value })}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="agent-staff-first-message">{t("agent:staffFirst.message.label")}</FieldLabel>
                      <FieldDescription>{serbian ? t("agent:staffFirst.message.noSerbianVoice") : t("agent:staffFirst.message.hint")}</FieldDescription>
                    </FieldContent>
                    <Textarea aria-label={t("agent:staffFirst.message.label")} id="agent-staff-first-message" maxLength={STAFF_FIRST_MESSAGE_MAX_LENGTH} onChange={(event) => update({ message: event.target.value })} placeholder={t("agent:staffFirst.message.placeholder")} rows={2} value={draft.message} />
                  </Field>
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="agent-staff-first-handover">{t("agent:staffFirst.handover.label")}</FieldLabel>
                      <FieldDescription>{serbian ? t("agent:staffFirst.message.noSerbianVoice") : t("agent:staffFirst.handover.hint")}</FieldDescription>
                    </FieldContent>
                    <Textarea aria-label={t("agent:staffFirst.handover.label")} id="agent-staff-first-handover" maxLength={STAFF_FIRST_MESSAGE_MAX_LENGTH} onChange={(event) => update({ handoverMessage: event.target.value })} placeholder={t("agent:staffFirst.handover.placeholder")} rows={2} value={draft.handoverMessage} />
                  </Field>
                </>
              )}
              {status ? <p className="type-body text-destructive" role="alert">{status}</p> : null}
            </FieldGroup>
          )}
        </div>
        <DialogFooter>
          <Button disabled={isSaving} onClick={() => onOpenChange(false)} type="button" variant="outline">{t("agent:actions.cancel")}</Button>
          <Button aria-label={t("agent:staffFirst.save")} disabled={isSaving || !draft} onClick={() => void save()} type="button">
            {isSaving ? t("agent:actions.saving") : t("agent:actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
