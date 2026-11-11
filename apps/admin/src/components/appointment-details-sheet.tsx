"use client";

import { useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { XIcon } from "lucide-react";
import { toast } from "sonner";

import { APPOINTMENT_ROLES, CancelAppointmentButton } from "@/components/cancel-appointment-button";
import { MoveAppointmentButton } from "@/components/move-appointment-dialog";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/components/ui/duration-picker";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { hasEnded, isCancelled, type Appointment } from "@/hooks/use-appointments";
import { requestJson } from "@/lib/request-json";
import { useIsMobile } from "@/hooks/use-mobile";
import { getChannelLabel, hasDisplayablePhone } from "@/lib/contact-display";
import { formatDateTime, intlLocale } from "@/lib/locale";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { Status } from "@/components/ui/status";
import { appointmentStatusVariant, calendarSyncVariant } from "@/lib/status-variants";

/**
 * Everything about one booking, including what its row truncates. A drawer
 * that slides up from the bottom on phones, where it's in thumb's reach and
 * can be swiped down, and in from the right on larger screens.
 */
export function AppointmentDetailsSheet({ appointment, contactName, onOpenChange }: {
  appointment: Appointment | undefined;
  contactName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  // Keeps showing the last booking while the drawer slides away after it's cleared.
  const shown = useRef({ appointment, contactName });
  if (appointment) shown.current = { appointment, contactName };
  const open = Boolean(appointment);
  ({ appointment, contactName } = shown.current);
  // The drawer stays mounted, closed, until the first booking, so it can animate in.
  return (
    <Drawer onOpenChange={onOpenChange} open={open} showSwipeHandle={isMobile} swipeDirection={isMobile ? "down" : "right"}>
      {appointment ? <AppointmentDetails appointment={appointment} contactName={contactName} showClose={!isMobile} /> : null}
    </Drawer>
  );
}

function AppointmentDetails({ appointment, contactName, showClose }: { appointment: Appointment; contactName: string; showClose: boolean }) {
  const { i18n, t } = useTranslation("common");
  const time = (value: string, options: Intl.DateTimeFormatOptions) => formatDateTime(value, i18n.language, { ...options, timeZone: appointment.timezone });
  const minutes = Math.round((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60_000);
  const details: Array<[string, React.ReactNode]> = [
    [t("appointments.service"), appointment.serviceName],
    ...(appointment.employeeName ? [[t("appointments.details.employee"), appointment.employeeName] as [string, React.ReactNode]] : []),
    ...(minutes > 0 ? [[t("appointments.details.duration"), formatDuration(minutes, intlLocale(i18n.language))] as [string, React.ReactNode]] : []),
    ...(hasDisplayablePhone(appointment.contactPhone) ? [[t("appointments.details.phone"), <a className="underline-offset-4 hover:underline" href={`tel:${appointment.contactPhone}`} key="phone">{formatPhoneNumberDisplay(appointment.contactPhone, i18n.language)}</a>] as [string, React.ReactNode]] : []),
    ...(appointment.contactEmail ? [[t("appointments.details.email"), <a className="break-all underline-offset-4 hover:underline" href={`mailto:${appointment.contactEmail}`} key="email">{appointment.contactEmail}</a>] as [string, React.ReactNode]] : []),
    [t("appointments.details.channel"), getChannelLabel(appointment.sourceChannel, t)],
    [t("appointments.status"), <Status key="status" variant={appointmentStatusVariant(appointment.status)}>{t(`appointments.statuses.${appointment.status}`, { defaultValue: appointment.status })}</Status>],
    // Shown only with a connected calendar; not_required means there's none.
    ...(appointment.calendarSyncState && appointment.calendarSyncState !== "not_required" ? [[t("appointments.calendar"), <Status key="calendar" variant={calendarSyncVariant(appointment.calendarSyncState)}>{t(`appointments.calendarStates.${appointment.calendarSyncState}`, { defaultValue: appointment.calendarSyncState })}</Status>] as [string, React.ReactNode]] : []),
  ];

  return (
      <DrawerContent>
        {showClose ? <DrawerClose render={<Button className="absolute top-3 right-3" size="icon-sm" variant="ghost" />}><XIcon /><span className="sr-only">{t("accessibility.close")}</span></DrawerClose> : null}
        <DrawerHeader className={showClose ? "pr-12" : undefined}>
          <DrawerTitle className="ph-mask text-lg">{contactName}</DrawerTitle>
          <DrawerDescription className="first-letter:uppercase">
            {time(appointment.startsAt, { weekday: "long", month: "long", day: "numeric" })} · {time(appointment.startsAt, { hour: "numeric", minute: "2-digit" })}–{time(appointment.endsAt, { hour: "numeric", minute: "2-digit" })}
          </DrawerDescription>
        </DrawerHeader>
        <div className="m-4 flex flex-1 flex-col gap-4 overflow-y-auto">
          <dl className="ph-mask flex flex-col divide-y">
            {details.map(([label, value]) => (
              <div className="flex items-start justify-between gap-6 py-3" key={label}>
                <dt className="shrink-0 text-muted-foreground">{label}</dt>
                <dd className="min-w-0 text-right">{value}</dd>
              </div>
            ))}
          </dl>
          {/* Keyed by appointment, so another booking starts from its own notes. */}
          <AppointmentNotes appointment={appointment} key={appointment.id} />
        </div>
        <DrawerFooter className="flex-row">
          {hasEnded(appointment) || isCancelled(appointment) ? null : <><MoveAppointmentButton appointment={{ ...appointment, contactName }} className="flex-1" size="default" /><CancelAppointmentButton appointment={{ ...appointment, contactName }} className="flex-1" size="default" variant="destructive" /></>}
          <DrawerClose render={<Button className="flex-1" variant="outline" />}>{t("accessibility.close")}</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
  );
}

/** The appointment's notes, which the agent can read to a verified caller, and its internal notes, which stay with the team. Schedulers and above edit them here. */
function AppointmentNotes({ appointment }: { appointment: Appointment }) {
  const { t } = useTranslation("common");
  const { business } = useActiveBusiness();
  const queryClient = useQueryClient();
  const notesId = useId();
  const internalId = useId();
  const [notes, setNotes] = useState(appointment.notes ?? "");
  const [internalNotes, setInternalNotes] = useState(appointment.internalNotes ?? "");
  const canEdit = Boolean(business && APPOINTMENT_ROLES.includes(business.role));
  const changed = notes.trim() !== (appointment.notes ?? "") || internalNotes.trim() !== (appointment.internalNotes ?? "");
  const save = useMutation({
    mutationFn: async () => await requestJson(`/api/appointments/${appointment.id}/notes?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PUT", body: JSON.stringify({ notes: notes.trim() || null, internalNotes: internalNotes.trim() || null }) }),
    onSuccess: async () => {
      toast.success(t("appointments.details.notesSaved"));
      await queryClient.invalidateQueries({ queryKey: ["appointments", business!.businessId] });
    },
    onError: () => { toast.error(t("appointments.details.notesFailed")); },
  });
  if (!canEdit && !appointment.notes && !appointment.internalNotes) return null;
  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (changed && !save.isPending) save.mutate(); }}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={notesId}>{t("appointments.create.notes")}</FieldLabel>
          <Textarea aria-describedby={`${notesId}-hint`} className="ph-mask" id={notesId} maxLength={2000} onChange={(event) => setNotes(event.target.value)} readOnly={!canEdit} rows={2} value={notes} />
          <FieldDescription id={`${notesId}-hint`}>{t("appointments.create.notesHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={internalId}>{t("appointments.create.internalNotes")}</FieldLabel>
          <Textarea aria-describedby={`${internalId}-hint`} className="ph-mask" id={internalId} maxLength={2000} onChange={(event) => setInternalNotes(event.target.value)} readOnly={!canEdit} rows={2} value={internalNotes} />
          <FieldDescription id={`${internalId}-hint`}>{t("appointments.create.internalNotesHint")}</FieldDescription>
        </Field>
      </FieldGroup>
      {canEdit && changed ? <Button className="self-end" loading={save.isPending} loadingLabel={t("appointments.details.savingNotes")} size="sm" type="submit">{t("appointments.details.saveNotes")}</Button> : null}
    </form>
  );
}
