"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { formatDateTime } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";

// The domain lets schedulers and above cancel appointments.
const CANCEL_ROLES = ["scheduler", "business_admin", "business_owner"];

export type CancellableAppointment = { id: string; startsAt: string; timezone: string; serviceName: string | null; contactName: string };

type Translate = (key: string, options: Record<string, string>) => string;

/** "Consultation for Alex on Mon, Sep 7, 2:30 PM", in the viewer's language. */
export function appointmentSummary(appointment: CancellableAppointment, locale: string, t: Translate): string {
  const time = formatDateTime(appointment.startsAt, locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: appointment.timezone });
  return appointment.serviceName
    ? t("common:appointments.cancel.summary", { service: appointment.serviceName, name: appointment.contactName, time })
    : t("common:appointments.cancel.summaryNoService", { name: appointment.contactName, time });
}

/**
 * Cancels an appointment after a confirmation, which also closes callers'
 * requests to cancel it. With `approve`, it reads as approving one of those
 * requests. Hidden from roles that can't cancel.
 */
export function CancelAppointmentButton({ appointment, approve, className }: { appointment: CancellableAppointment; approve?: boolean; className?: string }) {
  const { t, i18n } = useTranslation("common");
  const queryClient = useQueryClient();
  const { business } = useActiveBusiness();
  const [open, setOpen] = useState(false);
  const cancel = useMutation({
    mutationFn: async () => {
      try {
        await requestJson(`/api/appointments/${encodeURIComponent(appointment.id)}/cancel?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST" });
      } catch (error) {
        // Someone cancelled it first: the operator gets the outcome they asked for.
        if ((error as { code?: unknown }).code !== "already_cancelled") throw error;
      }
    },
    onSuccess: async () => {
      toast.success(t("appointments.cancel.done"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["appointments", business?.businessId] }),
      ]);
    },
    onError: () => { toast.error(t("appointments.cancel.failed")); },
  });

  if (!business || !CANCEL_ROLES.includes(business.role)) return null;
  const summary = appointmentSummary(appointment, i18n.language, t);
  return (
    <>
      <Button aria-label={approve ? undefined : t("appointments.cancel.actionLabel", { time: formatDateTime(appointment.startsAt, i18n.language, { dateStyle: "medium", timeStyle: "short", timeZone: appointment.timezone }) })} className={className} onClick={() => setOpen(true)} size="xs" variant="outline">
        {approve ? t("appointments.cancel.approve") : t("appointments.cancel.action")}
      </Button>
      <ConfirmActionDialog
        cancelLabel={t("appointments.cancel.keep")}
        confirmLabel={t("appointments.cancel.confirm")}
        confirmVariant="destructive"
        description={t(approve ? "appointments.cancel.requestDescription" : "appointments.cancel.description", { appointment: summary })}
        descriptionClassName="ph-mask"
        onConfirm={async () => { await cancel.mutateAsync(); }}
        onOpenChange={setOpen}
        open={open}
        pending={cancel.isPending}
        title={t("appointments.cancel.title")}
      />
    </>
  );
}
