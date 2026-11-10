"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { APPOINTMENT_ROLES, appointmentSummary, type CancellableAppointment } from "@/components/cancel-appointment-button";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { formatDateTime } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";
import { cn } from "@/lib/utils";

/**
 * Approves a caller's request to move an appointment: after a confirmation it moves it to the time they asked for,
 * which also closes the request. `newStartsAt` is the business's wall-clock time as the agent saved it. A time that
 * is no longer bookable leaves the appointment and the request as they were. Hidden from roles that can't reschedule.
 */
export function RescheduleAppointmentButton({ appointment, className, newStartsAt, size = "xs", variant = "default" }: { appointment: CancellableAppointment; className?: string; newStartsAt: string; size?: "xs" | "default"; variant?: "default" | "outline" }) {
  const { t, i18n } = useTranslation("common");
  const queryClient = useQueryClient();
  const { business } = useActiveBusiness();
  const [open, setOpen] = useState(false);
  const target = DateTime.fromISO(newStartsAt, { zone: appointment.timezone });
  const move = useMutation({
    mutationFn: async () => await requestJson(`/api/appointments/${encodeURIComponent(appointment.id)}/reschedule?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ startsAt: target.toUTC().toISO() }) }),
    onSuccess: async () => {
      toast.success(t("appointments.reschedule.done"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["appointments", business?.businessId] }),
        queryClient.invalidateQueries({ queryKey: ["call"] }),
      ]);
    },
    onError: (error) => {
      const code = (error as { code?: unknown }).code;
      toast.error(t(code === "slot_unavailable" ? "appointments.reschedule.unavailable" : code === "not_reschedulable" ? "appointments.reschedule.notReschedulable" : "appointments.reschedule.failed"));
    },
  });

  if (!business || !APPOINTMENT_ROLES.includes(business.role) || !target.isValid) return null;
  // A request whose time has gone can't be approved, so the button says why it's absent.
  if (target.toMillis() <= Date.now()) return <p className={cn("type-meta text-muted-foreground", className)}>{t("appointments.reschedule.passed")}</p>;
  const time = formatDateTime(target.toUTC().toISO()!, i18n.language, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: appointment.timezone });
  return (
    <>
      <Button className={className} onClick={() => setOpen(true)} size={size} type="button" variant={variant}>{t("appointments.reschedule.approve")}</Button>
      <ConfirmActionDialog
        cancelLabel={t("appointments.reschedule.keep")}
        confirmLabel={t("appointments.reschedule.confirm")}
        description={t("appointments.reschedule.description", { appointment: appointmentSummary(appointment, i18n.language, t), time })}
        descriptionClassName="ph-mask"
        onConfirm={async () => { await move.mutateAsync(); }}
        onOpenChange={setOpen}
        open={open}
        pending={move.isPending}
        title={t("appointments.reschedule.title", { time })}
      />
    </>
  );
}
