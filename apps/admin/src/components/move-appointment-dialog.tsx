"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { APPOINTMENT_ROLES, appointmentSummary, type CancellableAppointment } from "@/components/cancel-appointment-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OpeningsPicker } from "@/components/openings-picker";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { dayKey } from "@/lib/calendar-days";
import { formatRequestedStart } from "@/lib/follow-up-task";
import { formatDateTime } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";

/**
 * The time a caller asked for, as the business's wall-clock "YYYY-MM-DD" or
 * "YYYY-MM-DDTHH:mm". The dialog opens on it. Moving the appointment closes
 * the request.
 */
type RequestedTime = string | undefined;

const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

/** An instant as "YYYY-MM-DDTHH:mm" on the business's clock, to compare with a requested time. */
function wallClock(value: string, timeZone: string): string {
  let formatter = wallClockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    wallClockFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * A button that opens a picker of open times to move the appointment to. With
 * `requested`, the picker opens on the time a caller asked for. `otherTime`
 * labels it as the alternative to approving that time. Hidden from roles that
 * can't move appointments.
 */
export function MoveAppointmentButton({ appointment, requested, className, size = "xs", variant = "outline", otherTime = false }: { appointment: CancellableAppointment; requested?: RequestedTime; className?: string; size?: "xs" | "default"; variant?: "outline" | "default"; otherTime?: boolean }) {
  const { t, i18n } = useTranslation("common");
  const { business } = useActiveBusiness();
  const [open, setOpen] = useState(false);
  if (!business || !APPOINTMENT_ROLES.includes(business.role)) return null;
  return (
    <>
      <Button aria-label={otherTime ? undefined : t("appointments.move.actionLabel", { time: formatDateTime(appointment.startsAt, i18n.language, { dateStyle: "medium", timeStyle: "short", timeZone: appointment.timezone }) })} className={className} onClick={() => setOpen(true)} size={size} variant={variant}>
        {t(otherTime ? "appointments.move.otherTime" : "appointments.move.action")}
      </Button>
      {/* Mounted only while open, so it starts again from the appointment or the request each time. */}
      {open ? <MoveAppointmentDialog appointment={appointment} onOpenChange={setOpen} requested={requested} /> : null}
    </>
  );
}

function MoveAppointmentDialog({ appointment, requested: requestedTime, onOpenChange }: { appointment: CancellableAppointment; requested: RequestedTime; onOpenChange: (open: boolean) => void }) {
  const { t, i18n } = useTranslation("common");
  const queryClient = useQueryClient();
  const { business } = useActiveBusiness();
  const businessId = business!.businessId;
  const timeZone = appointment.timezone;
  const today = dayKey(new Date(), timeZone);
  const requested = requestedTime?.match(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/)?.[0];
  const requestedDay = requested?.slice(0, 10);
  const [date, setDate] = useState(requestedDay && requestedDay >= today ? requestedDay : dayKey(appointment.startsAt, timeZone) >= today ? dayKey(appointment.startsAt, timeZone) : today);
  const [chosen, setChosen] = useState<string | null>(null);

  const openingsKey = ["appointment-openings", businessId, appointment.id, date];
  const openings = useQuery({
    queryKey: openingsKey,
    queryFn: () => requestJson<{ openings: string[] }>(`/api/appointments/${encodeURIComponent(appointment.id)}/openings?businessId=${encodeURIComponent(businessId)}&date=${date}`),
  });
  // The appointment's own time isn't a move, so it isn't offered.
  const times = (openings.data?.openings ?? []).filter((value) => Date.parse(value) !== Date.parse(appointment.startsAt));
  // The requested time is picked for the operator when it's open.
  const selected = chosen ?? (requested?.includes("T") ? times.find((value) => wallClock(value, timeZone) === requested) ?? null : null);

  const move = useMutation({
    mutationFn: async (startsAt: string) => await requestJson(`/api/appointments/${encodeURIComponent(appointment.id)}/reschedule?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({ startsAt }) }),
    onSuccess: async () => {
      toast.success(t("appointments.move.done"));
      onOpenChange(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["appointments", businessId] }),
        queryClient.invalidateQueries({ queryKey: ["call"] }),
      ]);
    },
    onError: async (error) => {
      if ((error as { code?: unknown }).code === "slot_unavailable") {
        toast.error(t("appointments.move.taken"));
        setChosen(null);
        await queryClient.invalidateQueries({ queryKey: openingsKey });
        return;
      }
      toast.error(t("appointments.move.failed"));
    },
  });

  return (
    <Dialog onOpenChange={(next) => { if (!move.isPending) onOpenChange(next); }} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("appointments.move.title")}</DialogTitle>
          <DialogDescription className="ph-mask">{t("appointments.move.description", { appointment: appointmentSummary(appointment, i18n.language, t) })}</DialogDescription>
          {requested ? <p className="type-body-muted">{t("appointments.move.requested", { time: formatRequestedStart(requested, i18n.language) })}</p> : null}
        </DialogHeader>
        <OpeningsPicker date={date} failed={openings.isError} loading={openings.isLoading} onDateChange={(day) => { setDate(day); setChosen(null); }} onSelect={setChosen} selected={selected} timeZone={timeZone} times={times} today={today} />
        <DialogFooter>
          <DialogClose render={<Button disabled={move.isPending} type="button" variant="outline" />}>{t("appointments.move.keep")}</DialogClose>
          <Button disabled={!selected || move.isPending} onClick={() => { if (selected) move.mutate(selected); }} type="button">{t("appointments.move.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
