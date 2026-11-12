"use client";

import { useEffect, useId, useState, type ComponentType, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DateTime } from "luxon";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { ComboboxOptionsSkeleton, FieldControlSkeleton } from "@/components/loading-skeletons";
import { OpeningsPicker } from "@/components/openings-picker";
import { PhoneField, type PhoneFieldValue } from "@/components/phone-field";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dayKey } from "@/lib/calendar-days";
import { getContactDisplayName } from "@/lib/contact-display";
import { formatDateTimeRange } from "@/lib/locale";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";

type ContactOption = { id: string; name: string | null; phone: string | null; email: string | null; channels?: string[] };
type CatalogService = { id: string; name: string; active: boolean; assignedStaffIds: string[]; durationMinutes?: number };
type CatalogStaff = { id: string; name: string; active: boolean; isEmployee: boolean };
type Catalog = { services: CatalogService[]; staff: CatalogStaff[] };

const ANYONE = "anyone";
/** How long a new booking is drawn before a service gives it a length. */
export const DEFAULT_DRAFT_MINUTES = 60;
const MIN_MINUTES = 5;
const MAX_MINUTES = 720;
const MAX_NOTES = 2000;

/** What the calendar draws while a booking is being made. */
export type AppointmentDraft = { startsAt: string | null; durationMinutes: number; serviceId: string | null };

/**
 * The staff an operator can pick for a service: its assigned, active staff,
 * when there's more than one. A service with no one assigned is booked with
 * the staff that stand for the business, so it offers no choice.
 */
export function staffChoices(service: CatalogService | undefined, staff: CatalogStaff[]): CatalogStaff[] {
  if (!service) return [];
  const assigned = staff.filter((member) => member.active && service.assignedStaffIds.includes(member.id));
  return assigned.length > 1 ? assigned : [];
}

/** The same wall-clock time on another day of the business's calendar. */
function onDay(startsAt: string, day: string, timeZone: string): string {
  const time = DateTime.fromISO(startsAt).setZone(timeZone);
  return DateTime.fromISO(day, { zone: timeZone }).set({ hour: time.hour, minute: time.minute }).toUTC().toISO()!;
}

const sameInstant = (left: string | null, right: string) => left !== null && Date.parse(left) === Date.parse(right);

/**
 * The booking form shared by the New appointment dialog and the calendar's
 * slot popover and phone sheet: service, staff, contact, length, day and open time, and notes.
 * It books through POST /api/appointments, which checks the time is still
 * open. `initialStartsAt` preselects a time, such as a clicked slot, and
 * `onDraftChange` reports the time, length and service as they change, so
 * the calendar can draw the booking. `unavailable` names the time off a
 * time falls in, if any.
 */
export function AppointmentForm({ businessId, timeZone: fallbackTimeZone, initialStartsAt = null, onDraftChange, unavailable, onDone, onCancel, Footer, stacked = false, compact = false, header }: {
  businessId: string;
  timeZone: string;
  initialStartsAt?: string | null;
  onDraftChange?: (draft: AppointmentDraft) => void;
  unavailable?: ((startsAt: string, endsAt: string) => string | null) | undefined;
  onDone: () => void;
  onCancel: () => void;
  /** Wraps the buttons, such as DialogFooter. */
  Footer: ComponentType<{ children: ReactNode; className?: string }>;
  stacked?: boolean;
  /** A date field instead of a month, for a popover. */
  compact?: boolean;
  header?: ReactNode;
}) {
  const { t, i18n } = useTranslation("common");
  const queryClient = useQueryClient();
  const contactId = useId();
  const nameId = useId();
  const phoneId = useId();
  const serviceId = useId();
  const staffId = useId();
  const durationId = useId();
  const notesId = useId();
  const internalId = useId();
  const [contact, setContact] = useState<ContactOption | null>(null);
  const [newContact, setNewContact] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<PhoneFieldValue>({ phone: "", incomplete: false });
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [service, setService] = useState<string | null>(null);
  const [staff, setStaff] = useState(ANYONE);
  const [timeZone, setTimeZone] = useState(fallbackTimeZone);
  const today = dayKey(new Date(), timeZone);
  const [date, setDate] = useState(() => initialStartsAt ? dayKey(initialStartsAt, fallbackTimeZone) : today);
  const [chosen, setChosen] = useState<string | null>(initialStartsAt);
  // Null follows the service's length.
  const [duration, setDuration] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // A new slot click moves the time.
  useEffect(() => {
    if (!initialStartsAt) return;
    setChosen(initialStartsAt);
    setDate(dayKey(initialStartsAt, fallbackTimeZone));
  }, [initialStartsAt, fallbackTimeZone]);

  // Searches once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const contacts = useQuery({
    queryKey: ["contacts", businessId, "booking", query],
    queryFn: () => requestJson<{ contacts: ContactOption[] }>(`/api/contacts?businessId=${encodeURIComponent(businessId)}&limit=20${query ? `&search=${encodeURIComponent(query)}` : ""}`),
    enabled: !newContact,
  });
  // Booking texts the contact and finds them by phone, so only contacts with a number are offered.
  const contactOptions = (contacts.data?.contacts ?? []).filter((option) => option.phone);
  const catalog = useQuery({ queryKey: ["catalog", businessId], queryFn: () => requestJson<Catalog>(`/api/catalog?businessId=${encodeURIComponent(businessId)}&limit=100`) });
  const services = (catalog.data?.services ?? []).filter((option) => option.active);
  const selectedService = services.find((option) => option.id === service);
  const choices = staffChoices(selectedService, catalog.data?.staff ?? []);
  const staffPick = choices.some((member) => member.id === staff) ? staff : ANYONE;
  const serviceMinutes = selectedService?.durationMinutes;
  const typedMinutes = duration === null ? null : Number(duration);
  const durationInvalid = typedMinutes !== null && !(Number.isInteger(typedMinutes) && typedMinutes >= MIN_MINUTES && typedMinutes <= MAX_MINUTES);
  const minutes = typedMinutes !== null && !durationInvalid ? typedMinutes : serviceMinutes ?? DEFAULT_DRAFT_MINUTES;
  // Sent only when it differs from the service's, so the service's length stays the default.
  const customMinutes = typedMinutes !== null && !durationInvalid && typedMinutes !== serviceMinutes ? typedMinutes : undefined;

  const openingsKey = ["booking-openings", businessId, service, staffPick, date, customMinutes ?? null];
  const openings = useQuery({
    queryKey: openingsKey,
    queryFn: () => requestJson<{ timezone: string; openings: string[] }>(`/api/appointments/openings?businessId=${encodeURIComponent(businessId)}&serviceId=${encodeURIComponent(service!)}&date=${date}${staffPick === ANYONE ? "" : `&staffId=${encodeURIComponent(staffPick)}`}${customMinutes ? `&durationMinutes=${customMinutes}` : ""}`),
    enabled: Boolean(service) && !durationInvalid,
  });
  // The openings answer in the business's own timezone, which the times and days follow.
  useEffect(() => { if (openings.data?.timezone && openings.data.timezone !== timeZone) setTimeZone(openings.data.timezone); }, [openings.data?.timezone, timeZone]);
  const times = openings.data?.openings ?? [];
  const selected = times.find((time) => sameInstant(chosen, time)) ?? null;
  const endsAt = chosen ? new Date(Date.parse(chosen) + minutes * 60_000).toISOString() : null;
  const timeOff = chosen && endsAt && unavailable ? unavailable(chosen, endsAt) : null;
  const notOpen = Boolean(chosen && service && openings.isSuccess && !selected);

  useEffect(() => { onDraftChange?.({ startsAt: chosen, durationMinutes: minutes, serviceId: service }); }, [chosen, minutes, onDraftChange, service]);

  const book = useMutation({
    mutationFn: async (startsAt: string) => await requestJson<{ appointmentId: string }>(`/api/appointments?businessId=${encodeURIComponent(businessId)}`, {
      method: "POST",
      body: JSON.stringify({
        serviceId: service,
        startsAt,
        ...(staffPick === ANYONE ? {} : { staffId: staffPick }),
        ...(customMinutes ? { durationMinutes: customMinutes } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(internalNotes.trim() ? { internalNotes: internalNotes.trim() } : {}),
        ...(newContact ? { contact: { name: name.trim(), phone: phone.phone } } : { contactId: contact!.id }),
      }),
    }),
    onSuccess: async () => {
      toast.success(t("appointments.create.done"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["appointments", businessId] }),
        queryClient.invalidateQueries({ queryKey: ["contacts", businessId] }),
        queryClient.invalidateQueries({ queryKey: ["booking-openings", businessId] }),
      ]);
      onDone();
    },
    onError: async (error) => {
      if ((error as { code?: unknown }).code === "slot_unavailable") {
        toast.error(t("appointments.create.taken"));
        setChosen(null);
        await queryClient.invalidateQueries({ queryKey: openingsKey });
        return;
      }
      toast.error(t("appointments.create.failed"));
    },
  });

  const contactMissing = submitted && !newContact && !contact;
  const nameMissing = submitted && newContact && !name.trim();
  const phoneProblem = !submitted || !newContact ? null : phone.incomplete ? "phoneInvalid" : !phone.phone ? "phoneRequired" : null;
  const serviceMissing = submitted && !service;
  const timeMissing = submitted && Boolean(service) && !selected && !notOpen;
  const ready = (newContact ? name.trim() && phone.phone && !phone.incomplete : contact) && service && selected && !durationInvalid && !timeOff;
  const contactLabel = (option: ContactOption) => getContactDisplayName(option, i18n.language, t);
  const timeError = timeOff ? t("appointments.create.timeOff", { name: timeOff }) : notOpen ? t("appointments.create.notOpen") : null;

  return (
    <form className="flex min-h-0 flex-1 flex-col gap-6" noValidate onSubmit={(event) => { event.preventDefault(); setSubmitted(true); if (ready && !book.isPending) book.mutate(selected!); }}>
      {header}
      <div className="-m-1 min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1">
        <FieldGroup className="gap-4">
          <div className="grid gap-4">
            <Field data-invalid={serviceMissing || undefined}>
              <FieldLabel htmlFor={serviceId}>{t("appointments.create.service")}</FieldLabel>
              {catalog.isLoading ? <FieldControlSkeleton /> : catalog.isError ? <p className="type-body-muted text-destructive">{t("appointments.create.servicesFailed")}</p> : services.length ? <Select items={services.map((option) => ({ value: option.id, label: option.name }))} onValueChange={(value) => { setService(value as string | null); setStaff(ANYONE); setDuration(null); }} value={service}>
                <SelectTrigger aria-invalid={serviceMissing || undefined} className="w-full" id={serviceId}><SelectValue placeholder={t("appointments.create.servicePlaceholder")} /></SelectTrigger>
                <SelectContent><SelectGroup>{services.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select> : <p className="type-body-muted">{t("appointments.create.noServices")}</p>}
              {serviceMissing && services.length ? <FieldError>{t("appointments.create.serviceRequired")}</FieldError> : null}
            </Field>
            {choices.length ? <Field>
              <FieldLabel htmlFor={staffId}>{t("appointments.create.staff")}</FieldLabel>
              <Select items={[{ value: ANYONE, label: t("appointments.create.anyone") }, ...choices.map((member) => ({ value: member.id, label: member.name }))]} onValueChange={(value) => setStaff((value as string | null) ?? ANYONE)} value={staffPick}>
                <SelectTrigger className="w-full" id={staffId}><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value={ANYONE}>{t("appointments.create.anyone")}</SelectItem>{choices.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field> : null}
          </div>
          {newContact ? <>
            <Field data-invalid={nameMissing || undefined}>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor={nameId}>{t("appointments.create.name")}</FieldLabel>
                <Button onClick={() => { setNewContact(false); setSubmitted(false); }} size="xs" type="button" variant="ghost">{t("appointments.create.chooseContact")}</Button>
              </div>
              <Input aria-describedby={nameMissing ? `${nameId}-error` : undefined} aria-invalid={nameMissing || undefined} autoComplete="off" className="ph-mask" id={nameId} maxLength={200} onChange={(event) => setName(event.target.value)} value={name} />
              {nameMissing ? <FieldError id={`${nameId}-error`}>{t("appointments.create.nameRequired")}</FieldError> : null}
            </Field>
            <Field data-invalid={phoneProblem ? true : undefined}>
              <FieldLabel htmlFor={phoneId}>{t("appointments.create.phone")}</FieldLabel>
              <PhoneField countryLabel={t("appointments.create.phoneCountry")} errorId={phoneProblem ? `${phoneId}-error` : undefined} id={phoneId} onChange={setPhone} value={phone.phone} />
              {phoneProblem ? <FieldError id={`${phoneId}-error`}>{t(`appointments.create.${phoneProblem}`)}</FieldError> : null}
            </Field>
          </> : <Field data-invalid={contactMissing || undefined}>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor={contactId}>{t("appointments.create.contact")}</FieldLabel>
              <Button onClick={() => { setNewContact(true); setContact(null); setSubmitted(false); }} size="xs" type="button" variant="ghost"><Plus data-icon="inline-start" />{t("appointments.create.newContact")}</Button>
            </div>
            <Combobox
              filter={null}
              isItemEqualToValue={(item: ContactOption, value: ContactOption) => item.id === value.id}
              items={contactOptions}
              itemToStringLabel={contactLabel}
              onInputValueChange={(value) => setSearch(value)}
              onValueChange={(value: ContactOption | null) => setContact(value)}
              value={contact}
            >
              <ComboboxInput aria-describedby={contactMissing ? `${contactId}-error` : undefined} aria-invalid={contactMissing || undefined} className="ph-mask" clearSearchLabel={t("accessibility.clearSearch")} id={contactId} placeholder={t("appointments.create.contactSearch")} />
              <ComboboxContent>
                {contacts.isLoading || (contacts.isFetching && !contactOptions.length) ? <ComboboxOptionsSkeleton /> : contacts.isError ? <p className="px-3 py-2 type-body text-destructive">{t("appointments.create.contactsFailed")}</p> : <>
                  <ComboboxEmpty>{t("appointments.create.noContacts")}</ComboboxEmpty>
                  <ComboboxList>
                    {(option: ContactOption) => <ComboboxItem className="ph-mask" key={option.id} value={option}>
                      <span className="flex min-w-0 flex-col"><span className="truncate">{contactLabel(option)}</span>{option.name ? <span className="truncate type-caption text-muted-foreground">{formatPhoneNumberDisplay(option.phone!, i18n.language)}</span> : null}</span>
                    </ComboboxItem>}
                  </ComboboxList>
                </>}
              </ComboboxContent>
            </Combobox>
            {contactMissing ? <FieldError id={`${contactId}-error`}>{t("appointments.create.contactRequired")}</FieldError> : null}
          </Field>}
          <Field data-invalid={durationInvalid || undefined}>
            <FieldLabel htmlFor={durationId}>{t("appointments.create.duration")}</FieldLabel>
            <Input aria-invalid={durationInvalid || undefined} className="w-32" id={durationId} inputMode="numeric" max={MAX_MINUTES} min={MIN_MINUTES} onChange={(event) => setDuration(event.target.value)} step={5} type="number" value={duration ?? String(minutes)} />
            {durationInvalid ? <FieldError>{t("appointments.create.durationInvalid", { min: MIN_MINUTES, max: MAX_MINUTES })}</FieldError> : null}
          </Field>
          {/* Always shown, so the form asks for a time from the start and keeps its height once a service is picked. */}
          <Field data-invalid={timeMissing || Boolean(timeError) || undefined}>
            <OpeningsPicker date={date} failed={Boolean(service) && openings.isError} loading={Boolean(service) && openings.isLoading} onDateChange={(day) => { setDate(day); setChosen((current) => current ? onDay(current, day, timeZone) : null); }} onSelect={setChosen} compact={compact} selected={selected} stacked={stacked} timeZone={timeZone} times={service ? times : []} today={today} {...(service ? {} : { waiting: t("appointments.openings.chooseService") })} />
            {chosen && endsAt ? <p className="type-body-muted tabular-nums" data-testid="appointment-form-time">{formatDateTimeRange(chosen, endsAt, i18n.language, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone })}</p> : null}
            {timeError ? <FieldError>{timeError}</FieldError> : timeMissing ? <FieldError>{t("appointments.create.timeRequired")}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor={notesId}>{t("appointments.create.notes")}</FieldLabel>
            <Textarea aria-describedby={`${notesId}-hint`} id={notesId} maxLength={MAX_NOTES} onChange={(event) => setNotes(event.target.value)} rows={2} value={notes} />
            <FieldDescription id={`${notesId}-hint`}>{t("appointments.create.notesHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={internalId}>{t("appointments.create.internalNotes")}</FieldLabel>
            <Textarea aria-describedby={`${internalId}-hint`} id={internalId} maxLength={MAX_NOTES} onChange={(event) => setInternalNotes(event.target.value)} rows={2} value={internalNotes} />
            <FieldDescription id={`${internalId}-hint`}>{t("appointments.create.internalNotesHint")}</FieldDescription>
          </Field>
        </FieldGroup>
      </div>
      <Footer>
        <Button disabled={book.isPending} onClick={onCancel} type="button" variant="outline">{t("appointments.create.cancel")}</Button>
        <Button loading={book.isPending} loadingLabel={t("appointments.create.booking")} type="submit">{t("appointments.create.confirm")}</Button>
      </Footer>
    </form>
  );
}
