"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "lucide-react";

import { AppointmentForm, type AppointmentDraft } from "@/components/appointment-form";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

const DrawerButtons = ({ children }: { children: ReactNode; className?: string }) => <DrawerFooter className="flex-row justify-end px-0">{children}</DrawerFooter>;
const PanelFooter = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn("flex justify-end gap-2 border-t pt-4", className)}>{children}</div>;

/**
 * Books an appointment next to the calendar, which stays in view with the
 * booking drawn on it. Docked at the side on larger screens, where it isn't
 * modal: Escape or a click elsewhere on the page drops it. A bottom sheet on
 * phones. `startsAt` is the clicked slot, or null to pick a time in the panel.
 * Remount it (by key) for each new booking.
 */
export function NewAppointmentPanel({ businessId, timeZone, startsAt, onDraftChange, unavailable, onClose, phone, keepOpenWithin }: {
  businessId: string;
  timeZone: string;
  startsAt: string | null;
  onDraftChange: (draft: AppointmentDraft) => void;
  unavailable: (startsAt: string, endsAt: string) => string | null;
  onClose: () => void;
  phone: boolean;
  /** Clicks inside this element, such as the calendar, don't close the panel. */
  keepOpenWithin?: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation("common");
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const form = (Footer: typeof PanelFooter, header?: ReactNode) => <AppointmentForm businessId={businessId} Footer={Footer} header={header} initialStartsAt={startsAt} onCancel={onClose} onDone={onClose} onDraftChange={onDraftChange} stacked timeZone={timeZone} unavailable={unavailable} />;

  // A click elsewhere in the page's content drops the booking. Menus and pickers open outside it, so they don't count.
  useEffect(() => {
    if (phone) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest("main") || panel.current?.contains(target) || keepOpenWithin?.current?.contains(target)) return;
      onClose();
    };
    // Escape from inside the panel drops it too, unless an open menu or picker took the key.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && panel.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [keepOpenWithin, onClose, phone]);

  if (phone) {
    return (
      <Drawer onOpenChange={(open) => { if (!open) onClose(); }} open showSwipeHandle swipeDirection="down">
        <DrawerContent className="max-h-[90svh]">
          <DrawerHeader><DrawerTitle>{t("appointments.create.title")}</DrawerTitle></DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col px-4">{form(DrawerButtons)}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <aside
      aria-labelledby={titleId}
      className="flex max-h-[min(80svh,52rem)] w-full shrink-0 flex-col gap-4 rounded-xl border bg-background p-4 shadow-lg md:sticky md:top-4 md:w-[24rem]"
      ref={panel}
    >
      {form(PanelFooter, <div className="flex items-center justify-between gap-2">
        <h2 className="type-section-title type-body-lg" id={titleId}>{t("appointments.create.title")}</h2>
        <Button aria-label={t("accessibility.close")} onClick={onClose} size="icon-sm" type="button" variant="ghost"><XIcon /></Button>
      </div>)}
    </aside>
  );
}
