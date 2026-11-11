"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { AppointmentForm } from "@/components/appointment-form";
import { APPOINTMENT_ROLES } from "@/components/cancel-appointment-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActiveBusiness } from "@/hooks/use-active-business";

export { staffChoices } from "@/components/appointment-form";

/**
 * A button that books an appointment by hand in a dialog, for pages without
 * the appointments calendar, which books in its side panel instead. Hidden
 * from roles that can't book.
 */
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

function NewAppointmentDialog({ businessId, timeZone, onOpenChange }: { businessId: string; timeZone: string; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("common");
  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>{t("appointments.create.title")}</DialogTitle>
        </DialogHeader>
        <AppointmentForm businessId={businessId} Footer={DialogFooter} onCancel={() => onOpenChange(false)} onDone={() => onOpenChange(false)} timeZone={timeZone} />
      </DialogContent>
    </Dialog>
  );
}
