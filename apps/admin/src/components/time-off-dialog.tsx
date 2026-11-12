"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DateTime } from "luxon";
import { toast } from "sonner";

import { useTimeFormatPreference } from "@/components/appearance-provider";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { FieldControlSkeleton } from "@/components/loading-skeletons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";
import type { TimeOff } from "@/hooks/use-appointments";
import { addDays } from "@/lib/calendar-days";
import { intlLocale } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";

/** Who can add and change time off: the roles that edit the hours and employees. */
export const TIME_OFF_ROLES = ["business_admin", "business_owner"];

type Scope = "business" | "employee";
type Span = "day" | "part";
export type TimeOffValues = { scope: Scope; staffId: string | null; name: string; span: Span; startDate: string; endDate: string; startTime: string; endTime: string; note: string };

const local = (instant: string, timeZone: string) => DateTime.fromISO(instant).setZone(timeZone);

/** The dialog's fields for a saved time off, read on the business's clock; whole days when it runs midnight to midnight. */
export function timeOffValues(entry: TimeOff, timeZone: string): TimeOffValues {
  const [start, end] = [local(entry.startsAt, timeZone), local(entry.endsAt, timeZone)];
  const wholeDays = start.toFormat("HH:mm") === "00:00" && end.toFormat("HH:mm") === "00:00";
  return {
    scope: entry.staffId ? "employee" : "business",
    staffId: entry.staffId,
    name: entry.name,
    span: wholeDays ? "day" : "part",
    startDate: start.toISODate()!,
    endDate: wholeDays ? end.minus({ days: 1 }).toISODate()! : end.toISODate()!,
    startTime: wholeDays ? "09:00" : start.toFormat("HH:mm"),
    endTime: wholeDays ? "13:00" : end.toFormat("HH:mm"),
    note: entry.note ?? "",
  };
}

/** The local start and end the API takes: midnight to the midnight after the last day, or the chosen times. */
export function timeOffWindow(values: Pick<TimeOffValues, "span" | "startDate" | "endDate" | "startTime" | "endTime">): { startsAt: string; endsAt: string } {
  return values.span === "day"
    ? { startsAt: `${values.startDate}T00:00`, endsAt: `${addDays(values.endDate, 1)}T00:00` }
    : { startsAt: `${values.startDate}T${values.startTime}`, endsAt: `${values.endDate}T${values.endTime}` };
}

/**
 * Adds or changes a closure of the whole business or an employee's time off.
 * Booking already treats both as busy. With `entry` it edits that one and can
 * delete it, after a confirmation.
 */
export function TimeOffDialog({ businessId, timeZone, entry, day, onOpenChange }: {
  businessId: string;
  timeZone: string;
  entry?: TimeOff | undefined;
  /** The first day offered for a new one. */
  day: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation("common");
  const queryClient = useQueryClient();
  const ids = { staff: useId(), name: useId(), start: useId(), end: useId(), note: useId() };
  const [values, setValues] = useState<TimeOffValues>(() => entry ? timeOffValues(entry, timeZone) : { scope: "business", staffId: null, name: "", span: "day", startDate: day, endDate: day, startTime: "09:00", endTime: "13:00", note: "" });
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hourCycle = useTimeFormatPreference() ?? (i18n.language.startsWith("en") ? "ampm" : "24h");
  const set = (change: Partial<TimeOffValues>) => setValues((current) => ({ ...current, ...change }));
  const employees = useQuery({
    queryKey: ["employees", businessId, "time-off"],
    queryFn: () => requestJson<{ employees: Array<{ id: string; name: string }> }>(`/api/employees?businessId=${encodeURIComponent(businessId)}&limit=100`),
    enabled: values.scope === "employee",
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["time-off", businessId] }),
      queryClient.invalidateQueries({ queryKey: ["business-hours", businessId] }),
      queryClient.invalidateQueries({ queryKey: ["employees", businessId] }),
      // Open times change with time off.
      queryClient.invalidateQueries({ queryKey: ["booking-openings", businessId] }),
    ]);
  };
  const save = useMutation({
    mutationFn: async () => await requestJson(entry ? `/api/time-off/${entry.id}?businessId=${encodeURIComponent(businessId)}` : `/api/time-off?businessId=${encodeURIComponent(businessId)}`, {
      method: entry ? "PUT" : "POST",
      body: JSON.stringify({ staffId: values.scope === "employee" ? values.staffId : null, name: values.name.trim(), note: values.note.trim() || null, ...timeOffWindow(values) }),
    }),
    onSuccess: async () => { toast.success(t("appointments.timeOff.saved")); await refresh(); onOpenChange(false); },
    onError: (error) => { toast.error(t((error as { code?: unknown }).code === "time_off_overlap" ? "appointments.timeOff.overlap" : (error as { payload?: unknown }).payload ? "appointments.timeOff.invalid" : "appointments.timeOff.failed")); },
  });
  const remove = useMutation({
    mutationFn: async () => await requestJson(`/api/time-off/${entry!.id}?businessId=${encodeURIComponent(businessId)}`, { method: "DELETE" }),
    onSuccess: async () => { toast.success(t("appointments.timeOff.deleted")); await refresh(); onOpenChange(false); },
    onError: () => { toast.error(t("appointments.timeOff.failed")); },
  });

  const nameMissing = submitted && !values.name.trim();
  const staffMissing = submitted && values.scope === "employee" && !values.staffId;
  const datesMissing = submitted && (!values.startDate || !values.endDate);
  const endBeforeStart = Boolean(values.startDate && values.endDate) && (values.endDate < values.startDate || (values.span === "part" && values.endDate === values.startDate && values.endTime <= values.startTime));
  const ready = values.name.trim() && (values.scope === "business" || values.staffId) && values.startDate && values.endDate && !endBeforeStart;
  const pending = save.isPending || remove.isPending;
  const pickerLabels = { hours: t("appointments.timeOff.picker.hours"), minutes: t("appointments.timeOff.picker.minutes"), period: t("appointments.timeOff.picker.period") };
  const pickerTitles = { hours: t("appointments.timeOff.picker.hoursTitle"), minutes: t("appointments.timeOff.picker.minutesTitle") };

  return (
    <>
      <Dialog onOpenChange={(open) => { if (!pending) onOpenChange(open); }} open={!confirmDelete}>
        <DialogContent className="max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)]">
          <DialogHeader><DialogTitle>{t(entry ? "appointments.timeOff.editTitle" : "appointments.timeOff.title")}</DialogTitle></DialogHeader>
          <form className="flex min-h-0 flex-col gap-6" noValidate onSubmit={(event) => { event.preventDefault(); setSubmitted(true); if (ready && !pending) save.mutate(); }}>
            <div className="-m-1 min-h-0 overflow-x-hidden overflow-y-auto p-1">
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel>{t("appointments.timeOff.type")}</FieldLabel>
                  <Tabs onValueChange={(value) => set({ scope: value as Scope })} value={values.scope}>
                    <TabsList aria-label={t("appointments.timeOff.type")}>
                      <TabsTrigger value="business">{t("appointments.timeOff.business")}</TabsTrigger>
                      <TabsTrigger value="employee">{t("appointments.timeOff.employee")}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </Field>
                {values.scope === "employee" ? <Field data-invalid={staffMissing || undefined}>
                  <FieldLabel htmlFor={ids.staff}>{t("appointments.timeOff.employeeLabelField")}</FieldLabel>
                  {employees.isLoading ? <FieldControlSkeleton /> : employees.data?.employees.length ? <Select items={employees.data.employees.map((employee) => ({ value: employee.id, label: employee.name }))} onValueChange={(value) => set({ staffId: value as string | null })} value={values.staffId}>
                    <SelectTrigger aria-invalid={staffMissing || undefined} className="w-full" id={ids.staff}><SelectValue placeholder={t("appointments.timeOff.employeePlaceholder")} /></SelectTrigger>
                    <SelectContent><SelectGroup>{employees.data.employees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select> : <p className="type-body-muted">{t("appointments.timeOff.noEmployees")}</p>}
                  {staffMissing ? <FieldError>{t("appointments.timeOff.employeeRequired")}</FieldError> : null}
                </Field> : null}
                <Field data-invalid={nameMissing || undefined}>
                  <FieldLabel htmlFor={ids.name}>{t("appointments.timeOff.name")}</FieldLabel>
                  <Input aria-invalid={nameMissing || undefined} id={ids.name} maxLength={100} onChange={(event) => set({ name: event.target.value })} placeholder={t("appointments.timeOff.namePlaceholder")} value={values.name} />
                  {nameMissing ? <FieldError>{t("appointments.timeOff.nameRequired")}</FieldError> : null}
                </Field>
                <Field>
                  <FieldLabel>{t("appointments.timeOff.hours")}</FieldLabel>
                  <Tabs onValueChange={(value) => set({ span: value as Span })} value={values.span}>
                    <TabsList aria-label={t("appointments.timeOff.hours")}>
                      <TabsTrigger value="day">{t("appointments.timeOff.allDay")}</TabsTrigger>
                      <TabsTrigger value="part">{t("appointments.timeOff.partDay")}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={datesMissing || undefined}>
                    <FieldLabel htmlFor={ids.start}>{t("appointments.timeOff.startDate")}</FieldLabel>
                    <Input id={ids.start} onChange={(event) => set({ startDate: event.target.value, ...(values.endDate < event.target.value ? { endDate: event.target.value } : {}) })} type="date" value={values.startDate} />
                  </Field>
                  <Field data-invalid={endBeforeStart || datesMissing || undefined}>
                    <FieldLabel htmlFor={ids.end}>{t("appointments.timeOff.endDate")}</FieldLabel>
                    <Input aria-invalid={endBeforeStart || undefined} id={ids.end} min={values.startDate} onChange={(event) => set({ endDate: event.target.value })} type="date" value={values.endDate} />
                  </Field>
                  {values.span === "part" ? <>
                    <Field>
                      <FieldLabel>{t("appointments.timeOff.startTime")}</FieldLabel>
                      <TimePicker aria-label={t("appointments.timeOff.startTime")} columnLabels={pickerLabels} columnTitles={pickerTitles} hourCycle={hourCycle} locale={intlLocale(i18n.language)} onChange={(startTime) => set({ startTime })} value={values.startTime} />
                    </Field>
                    <Field>
                      <FieldLabel>{t("appointments.timeOff.endTime")}</FieldLabel>
                      <TimePicker aria-label={t("appointments.timeOff.endTime")} columnLabels={pickerLabels} columnTitles={pickerTitles} hourCycle={hourCycle} locale={intlLocale(i18n.language)} onChange={(endTime) => set({ endTime })} value={values.endTime} />
                    </Field>
                  </> : null}
                </div>
                {endBeforeStart ? <FieldError>{t("appointments.timeOff.endBeforeStart")}</FieldError> : datesMissing ? <FieldError>{t("appointments.timeOff.datesRequired")}</FieldError> : null}
                <Field>
                  <FieldLabel htmlFor={ids.note}>{t("appointments.timeOff.reason")}</FieldLabel>
                  <Textarea id={ids.note} maxLength={500} onChange={(event) => set({ note: event.target.value })} rows={2} value={values.note} />
                </Field>
              </FieldGroup>
            </div>
            <DialogFooter className="sm:justify-between">
              {entry ? <Button disabled={pending} onClick={() => setConfirmDelete(true)} type="button" variant="destructive">{t("appointments.timeOff.delete")}</Button> : <span aria-hidden="true" className="hidden sm:block" />}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <DialogClose render={<Button disabled={pending} type="button" variant="outline" />}>{t("appointments.timeOff.cancel")}</DialogClose>
                <Button loading={save.isPending} loadingLabel={t("appointments.timeOff.saving")} type="submit">{t("appointments.timeOff.save")}</Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {entry ? <ConfirmActionDialog cancelLabel={t("appointments.timeOff.keep")} confirmLabel={t("appointments.timeOff.delete")} confirmVariant="destructive" description={t("appointments.timeOff.deleteDescription", { name: entry.name })} onConfirm={async () => { await remove.mutateAsync(); }} onOpenChange={setConfirmDelete} open={confirmDelete} pending={remove.isPending} title={t("appointments.timeOff.deleteTitle")} /> : null}
    </>
  );
}
