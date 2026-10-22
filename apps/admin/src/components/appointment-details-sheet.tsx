"use client";

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "lucide-react";

import { CancelAppointmentButton } from "@/components/cancel-appointment-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/components/ui/duration-picker";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { hasEnded, type Appointment } from "@/hooks/use-appointments";
import { useIsMobile } from "@/hooks/use-mobile";
import { getChannelLabel, hasDisplayablePhone } from "@/lib/contact-display";
import { formatDateTime, intlLocale } from "@/lib/locale";
import { formatPhoneNumberDisplay } from "@/lib/phone";

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
    [t("appointments.status"), <Badge key="status" variant="secondary">{t(`appointments.statuses.${appointment.status}`, { defaultValue: appointment.status })}</Badge>],
    [t("appointments.calendar"), t(`appointments.calendarStates.${appointment.calendarSyncState}`, { defaultValue: appointment.calendarSyncState.replaceAll("_", " ") })],
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
        <dl className="ph-mask m-4 flex flex-1 flex-col divide-y overflow-y-auto">
          {details.map(([label, value]) => (
            <div className="flex items-start justify-between gap-6 py-3" key={label}>
              <dt className="shrink-0 text-muted-foreground">{label}</dt>
              <dd className="min-w-0 text-right">{value}</dd>
            </div>
          ))}
        </dl>
        <DrawerFooter className="flex-row">
          {hasEnded(appointment) ? null : <CancelAppointmentButton appointment={{ ...appointment, contactName }} className="flex-1" size="default" variant="destructive" />}
          <DrawerClose render={<Button className="flex-1" variant="outline" />}>{t("accessibility.close")}</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
  );
}
