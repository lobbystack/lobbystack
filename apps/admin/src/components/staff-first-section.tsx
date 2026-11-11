"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_STAFF_FIRST_RING_SECONDS, isTransferCountry, normalizeStaffFirstMode, STAFF_FIRST_MESSAGE_MAX_LENGTH, staffFirstModes, staffFirstRingSeconds, type RuntimeLocale, type StaffFirstMode } from "@lobbystack/shared";
import type { Country } from "react-phone-number-input/input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SmallButtonSkeleton } from "@/components/loading-skeletons";
import { useTelemetry } from "@/components/product-analytics";
import { PhoneCountrySelect } from "@/components/phone-country-select";
import { errorCode } from "@/lib/checkout-errors";
import { formatPhoneNumberDisplay, getDefaultTransferCountry, getPhoneCountryOptions, inferPhoneCountry } from "@/lib/phone";

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

/** Where an agent's page scrolls to Staff answers first, as Home's phone card links it. */
export const STAFF_FIRST_ANCHOR = "staff-first";

/**
 * Staff answers first: which phone rings before the receptionist answers, and for how long. The row says
 * whether it's on and which phone rings; Set up or Edit opens the whole setting in a dialog.
 */
export function StaffFirstSection({ businessId, block, canManage, defaultLocale, isLoading, onSave, profile }: {
  businessId: string;
  block: "plan" | "carrier" | "setup" | null;
  canManage: boolean;
  defaultLocale: RuntimeLocale;
  isLoading: boolean;
  onSave: (patch: StaffFirstPatch) => Promise<void>;
  profile: StaffFirstProfile | null | undefined;
}) {
  const { i18n, t } = useTranslation(["agent", "common"]);
  const telemetry = useTelemetry();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<StaffFirstMode>("never");
  const [number, setNumber] = useState("");
  const [rawNumber, setRawNumber] = useState("");
  const [ringSeconds, setRingSeconds] = useState<number>(DEFAULT_STAFF_FIRST_RING_SECONDS);
  const [message, setMessage] = useState("");
  const [handoverMessage, setHandoverMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // What the last save sent, shown in the row until other settings come back from the server.
  const [lastSave, setLastSave] = useState<{ patch: StaffFirstPatch; profile: StaffFirstProfile | null | undefined } | null>(null);
  const saved = lastSave && lastSave.profile === profile ? lastSave.patch : null;
  const defaultCountry = getDefaultTransferCountry(i18n.language) as Country;
  const countries = useMemo(() => getPhoneCountryOptions(i18n.language).filter((option) => isTransferCountry(option.code)), [i18n.language]);
  const [country, setCountry] = useState<Country>(defaultCountry);
  const sectionRef = useRef<HTMLElement>(null);
  const scrolled = useRef(false);

  // Home's phone card links here. The page scrolls once the settings have loaded, so the sections above stop moving.
  useEffect(() => {
    if (isLoading || scrolled.current) return;
    scrolled.current = true;
    if (window.location.hash === `#${STAFF_FIRST_ANCHOR}`) sectionRef.current?.scrollIntoView({ block: "start" });
  }, [isLoading]);

  const savedMode = saved?.staffFirstMode ?? normalizeStaffFirstMode(profile?.staffFirstMode);
  const savedNumber = saved ? saved.staffFirstNumber : profile?.staffFirstNumber ?? null;
  // A business that lost access can still turn the setting off.
  const disabled = !canManage || (block !== null && savedMode === "never");
  const typedNumber = rawNumber.trim();

  /** Opens the dialog on the saved settings, with the transfer number filled in until a staff phone is saved. */
  function openDialog() {
    const phone = savedNumber ?? profile?.transferNumber ?? "";
    setMode(savedMode);
    setNumber(phone);
    setRawNumber(phone);
    setCountry((inferPhoneCountry(phone, defaultCountry) ?? defaultCountry) as Country);
    setRingSeconds(saved?.staffFirstRingSeconds ?? profile?.staffFirstRingSeconds ?? DEFAULT_STAFF_FIRST_RING_SECONDS);
    setMessage((saved ? saved.staffFirstMessage : profile?.staffFirstMessage) ?? "");
    setHandoverMessage((saved ? saved.staffFirstHandoverMessage : profile?.staffFirstHandoverMessage) ?? "");
    setStatus(null);
    setOpen(true);
  }

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
      const patch: StaffFirstPatch = { staffFirstMode: mode, staffFirstNumber: typedNumber ? number : null, staffFirstRingSeconds: ringSeconds, staffFirstMessage: message.trim() || null, staffFirstHandoverMessage: handoverMessage.trim() || null };
      await onSave(patch);
      // Kept against the settings it was made on: once the refetch brings new ones, they take over.
      setLastSave({ patch, profile });
      setOpen(false);
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

  const modeLabel = t(`agent:staffFirst.mode.options.${savedMode}`);
  const state = savedMode === "never" ? modeLabel : savedNumber ? t("agent:staffFirst.state", { mode: modeLabel, number: formatPhoneNumberDisplay(savedNumber, i18n.language) }) : modeLabel;
  const titleId = `${STAFF_FIRST_ANCHOR}-row-title`;
  const serbian = defaultLocale === "sr";

  return (
    <section className="flex scroll-mt-20 flex-col gap-3 md:scroll-mt-6" id={STAFF_FIRST_ANCHOR} ref={sectionRef}>
      <h2 className="type-title">{t("agent:staffFirst.title")}</h2>
      <Surface className="flex flex-col">
        <Item variant="default">
          <ItemContent>
            <ItemTitle id={titleId}>{t("agent:staffFirst.mode.label")}</ItemTitle>
            {isLoading || !profile ? (
              // A div in the description's type, not the description itself: a placeholder is a div, which can't sit in a <p>.
              <div aria-hidden="true" className="type-body-muted" data-slot="staff-first-state-skeleton"><Skeleton className="h-[1lh] w-40 max-w-full" /></div>
            ) : (
              <>
                {/* Off while blocked says why instead; a business that lost access still sees what's on. */}
                {block && savedMode === "never" ? null : <ItemDescription>{state}</ItemDescription>}
                {block ? <ItemDescription>{t(`agent:staffFirst.unavailable.${block}`)}</ItemDescription> : null}
              </>
            )}
          </ItemContent>
          <ItemActions>
            {isLoading || !profile ? <SmallButtonSkeleton label={t("agent:staffFirst.setUp")} /> : (
              <Button aria-describedby={titleId} disabled={disabled} onClick={openDialog} size="sm" type="button" variant="outline">
                {savedMode === "never" ? t("agent:staffFirst.setUp") : t("agent:actions.edit")}
              </Button>
            )}
          </ItemActions>
        </Item>
      </Surface>
      <Dialog onOpenChange={(next) => { if (!isSaving) setOpen(next); }} open={open}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle>{t("agent:staffFirst.mode.label")}</DialogTitle>
          </DialogHeader>
          {/* The padding keeps the focus rings clear of the scroll edge. */}
          <div className="-m-1 min-h-0 overflow-y-auto p-1">
            <FieldGroup>
              <Field>
                <FieldLabel id="agent-staff-first-mode-label">{t("agent:staffFirst.mode.when")}</FieldLabel>
                <SegmentedControl aria-describedby="agent-staff-first-mode-effect" aria-labelledby="agent-staff-first-mode-label" onValueChange={(next: StaffFirstMode) => { setMode(next); setStatus(null); }} value={mode}>
                  {staffFirstModes.map((value) => <SegmentedControlItem key={value} value={value}>{t(`agent:staffFirst.mode.options.${value}`)}</SegmentedControlItem>)}
                </SegmentedControl>
                {/* What happens to a call with the chosen option, so Off isn't an empty dialog. */}
                <Item size="sm" variant="muted">
                  <ItemContent><ItemDescription aria-live="polite" id="agent-staff-first-mode-effect">{t(MODE_EFFECT_KEYS[mode])}</ItemDescription></ItemContent>
                </Item>
              </Field>
              {mode === "never" ? null : (
                <>
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="agent-staff-first-number">{t("agent:staffFirst.number.label")}</FieldLabel>
                      <FieldDescription>{t("agent:staffFirst.number.hint")}</FieldDescription>
                    </FieldContent>
                    <div className="flex w-full min-w-0">
                      <PhoneCountrySelect ariaLabel={t("agent:fields.transferNumber.country")} className="rounded-r-none px-4 font-medium text-muted-foreground" countries={countries} onChange={(next) => { setCountry(next as Country); setNumber(""); setRawNumber(""); setStatus(null); }} value={country} />
                      <PhoneInput
                        aria-label={t("agent:staffFirst.number.label")}
                        className="rounded-l-none border-l-0"
                        containerClassName="min-w-0 flex-1"
                        country={country}
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
                  </Field>
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="agent-staff-first-ring">{t("agent:staffFirst.ring.label")}</FieldLabel>
                      <FieldDescription>{t("agent:staffFirst.ring.hint")}</FieldDescription>
                    </FieldContent>
                    <Select items={staffFirstRingSeconds.map((value) => ({ value: String(value), label: t("agent:staffFirst.ring.seconds", { count: value }) }))} onValueChange={(next) => { if (next) setRingSeconds(Number(next)); }} value={String(ringSeconds)}>
                      <SelectTrigger aria-label={t("agent:staffFirst.ring.label")} className="w-full" id="agent-staff-first-ring"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectGroup>{staffFirstRingSeconds.map((value) => <SelectItem key={value} value={String(value)}>{t("agent:staffFirst.ring.seconds", { count: value })}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="agent-staff-first-message">{t("agent:staffFirst.message.label")}</FieldLabel>
                      <FieldDescription>{serbian ? t("agent:staffFirst.message.noSerbianVoice") : t("agent:staffFirst.message.hint")}</FieldDescription>
                    </FieldContent>
                    <Textarea aria-label={t("agent:staffFirst.message.label")} id="agent-staff-first-message" maxLength={STAFF_FIRST_MESSAGE_MAX_LENGTH} onChange={(event) => setMessage(event.target.value)} rows={2} value={message} />
                  </Field>
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="agent-staff-first-handover">{t("agent:staffFirst.handover.label")}</FieldLabel>
                      <FieldDescription>{serbian ? t("agent:staffFirst.message.noSerbianVoice") : t("agent:staffFirst.handover.hint")}</FieldDescription>
                    </FieldContent>
                    <Textarea aria-label={t("agent:staffFirst.handover.label")} id="agent-staff-first-handover" maxLength={STAFF_FIRST_MESSAGE_MAX_LENGTH} onChange={(event) => setHandoverMessage(event.target.value)} rows={2} value={handoverMessage} />
                  </Field>
                </>
              )}
              {status ? <p className="type-body text-destructive" role="alert">{status}</p> : null}
            </FieldGroup>
          </div>
          <DialogFooter>
            <Button disabled={isSaving} onClick={() => setOpen(false)} type="button" variant="outline">{t("agent:actions.cancel")}</Button>
            <Button aria-label={t("agent:staffFirst.save")} disabled={isSaving} onClick={() => void save()} type="button">
              {isSaving ? t("agent:actions.saving") : t("agent:actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
