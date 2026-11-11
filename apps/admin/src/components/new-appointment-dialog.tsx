"use client";

import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { APPOINTMENT_ROLES } from "@/components/cancel-appointment-button";
import { ComboboxOptionsSkeleton, FieldControlSkeleton } from "@/components/loading-skeletons";
import { OpeningsPicker } from "@/components/openings-picker";
import { PhoneField, type PhoneFieldValue } from "@/components/phone-field";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { dayKey } from "@/lib/calendar-days";
import { getContactDisplayName } from "@/lib/contact-display";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";

type ContactOption = { id: string; name: string | null; phone: string | null; email: string | null; channels?: string[] };
type CatalogService = { id: string; name: string; active: boolean; assignedStaffIds: string[] };
type CatalogStaff = { id: string; name: string; active: boolean; isEmployee: boolean };
type Catalog = { services: CatalogService[]; staff: CatalogStaff[] };

const ANYONE = "anyone";

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

/** The header button that books an appointment by hand. Hidden from roles that can't book. */
export function NewAppointmentButton({ timeZone }: { timeZone: string }) {
  const { t } = useTranslation("common");
  const { business } = useActiveBusiness();
  const [open, setOpen] = useState(false);
  if (!business || !APPOINTMENT_ROLES.includes(business.role)) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus data-icon="inline-start" />{t("appointments.create.action")}</Button>
      {/* Mounted only while open, so each booking starts from empty fields. */}
      {open ? <NewAppointmentDialog businessId={business.businessId} onOpenChange={setOpen} timeZone={timeZone} /> : null}
    </>
  );
}

function NewAppointmentDialog({ businessId, timeZone: fallbackTimeZone, onOpenChange }: { businessId: string; timeZone: string; onOpenChange: (open: boolean) => void }) {
  const { t, i18n } = useTranslation("common");
  const queryClient = useQueryClient();
  const contactId = useId();
  const nameId = useId();
  const phoneId = useId();
  const serviceId = useId();
  const staffId = useId();
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
  const [date, setDate] = useState(today);
  const [chosen, setChosen] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

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

  const openingsKey = ["booking-openings", businessId, service, staffPick, date];
  const openings = useQuery({
    queryKey: openingsKey,
    queryFn: () => requestJson<{ timezone: string; openings: string[] }>(`/api/appointments/openings?businessId=${encodeURIComponent(businessId)}&serviceId=${encodeURIComponent(service!)}&date=${date}${staffPick === ANYONE ? "" : `&staffId=${encodeURIComponent(staffPick)}`}`),
    enabled: Boolean(service),
  });
  // The openings answer in the business's own timezone, which the times and days follow.
  useEffect(() => { if (openings.data?.timezone && openings.data.timezone !== timeZone) setTimeZone(openings.data.timezone); }, [openings.data?.timezone, timeZone]);
  const times = openings.data?.openings ?? [];
  const selected = chosen && times.includes(chosen) ? chosen : null;

  const book = useMutation({
    mutationFn: async (startsAt: string) => await requestJson<{ appointmentId: string }>(`/api/appointments?businessId=${encodeURIComponent(businessId)}`, {
      method: "POST",
      body: JSON.stringify({ serviceId: service, startsAt, ...(staffPick === ANYONE ? {} : { staffId: staffPick }), ...(newContact ? { contact: { name: name.trim(), phone: phone.phone } } : { contactId: contact!.id }) }),
    }),
    onSuccess: async () => {
      toast.success(t("appointments.create.done"));
      onOpenChange(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["appointments", businessId] }),
        queryClient.invalidateQueries({ queryKey: ["contacts", businessId] }),
      ]);
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
  const timeMissing = submitted && Boolean(service) && !selected;
  const ready = (newContact ? name.trim() && phone.phone && !phone.incomplete : contact) && service && selected;
  const contactLabel = (option: ContactOption) => getContactDisplayName(option, i18n.language, t);

  return (
    <Dialog onOpenChange={(next) => { if (!book.isPending) onOpenChange(next); }} open>
      <DialogContent className="max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>{t("appointments.create.title")}</DialogTitle>
        </DialogHeader>
        <form className="flex min-h-0 flex-col gap-6" noValidate onSubmit={(event) => { event.preventDefault(); setSubmitted(true); if (ready && !book.isPending) book.mutate(selected!); }}>
          <div className="-m-1 min-h-0 overflow-x-hidden overflow-y-auto p-1">
            <FieldGroup className="gap-4">
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
              <div className="grid gap-4">
                <Field data-invalid={serviceMissing || undefined}>
                  <FieldLabel htmlFor={serviceId}>{t("appointments.create.service")}</FieldLabel>
                  {catalog.isLoading ? <FieldControlSkeleton /> : catalog.isError ? <p className="type-body-muted text-destructive">{t("appointments.create.servicesFailed")}</p> : services.length ? <Select items={services.map((option) => ({ value: option.id, label: option.name }))} onValueChange={(value) => { setService(value as string | null); setStaff(ANYONE); setChosen(null); }} value={service}>
                    <SelectTrigger aria-invalid={serviceMissing || undefined} className="w-full" id={serviceId}><SelectValue placeholder={t("appointments.create.servicePlaceholder")} /></SelectTrigger>
                    <SelectContent><SelectGroup>{services.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select> : <p className="type-body-muted">{t("appointments.create.noServices")}</p>}
                  {serviceMissing && services.length ? <FieldError>{t("appointments.create.serviceRequired")}</FieldError> : null}
                </Field>
                {choices.length ? <Field>
                  <FieldLabel htmlFor={staffId}>{t("appointments.create.staff")}</FieldLabel>
                  <Select items={[{ value: ANYONE, label: t("appointments.create.anyone") }, ...choices.map((member) => ({ value: member.id, label: member.name }))]} onValueChange={(value) => { setStaff((value as string | null) ?? ANYONE); setChosen(null); }} value={staffPick}>
                    <SelectTrigger className="w-full" id={staffId}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup><SelectItem value={ANYONE}>{t("appointments.create.anyone")}</SelectItem>{choices.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                </Field> : null}
              </div>
              {/* Always shown, so the dialog asks for a time from the start and keeps its height once a service is picked. */}
              <Field data-invalid={timeMissing || undefined}>
                <OpeningsPicker date={date} failed={Boolean(service) && openings.isError} loading={Boolean(service) && openings.isLoading} onDateChange={(day) => { setDate(day); setChosen(null); }} onSelect={setChosen} selected={selected} timeZone={timeZone} times={service ? times : []} today={today} {...(service ? {} : { waiting: t("appointments.openings.chooseService") })} />
                {timeMissing ? <FieldError>{t("appointments.create.timeRequired")}</FieldError> : null}
              </Field>
            </FieldGroup>
          </div>
          <DialogFooter>
            <DialogClose render={<Button disabled={book.isPending} type="button" variant="outline" />}>{t("appointments.create.cancel")}</DialogClose>
            <Button loading={book.isPending} loadingLabel={t("appointments.create.booking")} type="submit">{t("appointments.create.confirm")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
