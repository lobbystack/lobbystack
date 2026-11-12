"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "lucide-react";

import { AppointmentForm, type AppointmentDraft } from "@/components/appointment-form";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const DrawerButtons = ({ children }: { children: ReactNode; className?: string }) => <DrawerFooter className="flex-row justify-end px-0">{children}</DrawerFooter>;
const PopoverFooter = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn("flex justify-end gap-2 border-t pt-4", className)}>{children}</div>;

// The popover's width, its gap to the draft and its margin from the window's edge, in pixels.
const POPOVER_WIDTH = 384;
const SIDE_OFFSET = 8;
const EDGE = 16;

/** Beside the draft when either side has room, else below it, as for a day's full-width draft. */
function sideFor(anchor: Element | null): "right" | "bottom" {
  if (!anchor || typeof window === "undefined") return "right";
  const rect = anchor.getBoundingClientRect();
  const room = POPOVER_WIDTH + SIDE_OFFSET + EDGE;
  return window.innerWidth - rect.right >= room || rect.left >= room ? "right" : "bottom";
}

/** A calendar slot, which moves the booking rather than closing it. */
function onSlot(event: Event | undefined): boolean {
  const target = (event instanceof FocusEvent ? event.relatedTarget : event?.target) as Element | null | undefined;
  return Boolean(target?.closest?.("[data-starts-at]"));
}

type SlotBookingProps = {
  businessId: string;
  timeZone: string;
  /** The clicked slot's time; a later click moves it. */
  startsAt: string | null;
  onDraftChange: (draft: AppointmentDraft) => void;
  unavailable: (startsAt: string, endsAt: string) => string | null;
  onClose: () => void;
};

/**
 * Books an appointment from a clicked calendar slot, in a popover over the
 * calendar beside the booking it draws there. Escape, Cancel or a click
 * elsewhere drops it; a click on another slot moves it. Keep it mounted and
 * key `formKey` per booking, so closing animates and hands focus back to the
 * slot.
 */
export function NewAppointmentPopover({ open, formKey, anchor, returnFocus, ...props }: SlotBookingProps & {
  open: boolean;
  formKey: number | undefined;
  /** The draft block, or the slot until it's drawn. */
  anchor: Element | null;
  returnFocus: HTMLElement | null;
}) {
  const { t } = useTranslation("common");
  const side = sideFor(anchor);
  return (
    <Popover onOpenChange={(next, details) => {
      if (next) return;
      if ((details.reason === "outside-press" || details.reason === "focus-out") && onSlot(details.event)) return;
      props.onClose();
    }} open={open}>
      <PopoverContent
        align={side === "right" ? "start" : "center"}
        anchor={anchor}
        className="max-h-[min(var(--available-height),44rem)] w-[min(24rem,calc(100vw-2rem))] gap-4 p-4"
        collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: side === "right" ? "end" : "none" }}
        collisionPadding={EDGE}
        finalFocus={() => (returnFocus?.isConnected ? returnFocus : true)}
        side={side}
        sideOffset={SIDE_OFFSET}
      >
        <AppointmentForm
          businessId={props.businessId}
          compact
          Footer={PopoverFooter}
          header={<div className="flex items-center justify-between gap-2">
            <PopoverTitle className="type-section-title type-body-lg">{t("appointments.create.title")}</PopoverTitle>
            <Button aria-label={t("accessibility.close")} onClick={props.onClose} size="icon-sm" type="button" variant="ghost"><XIcon /></Button>
          </div>}
          initialStartsAt={props.startsAt}
          key={formKey}
          onCancel={props.onClose}
          onDone={props.onClose}
          onDraftChange={props.onDraftChange}
          stacked
          timeZone={props.timeZone}
          unavailable={props.unavailable}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The same booking on phones, where a popover beside a slot doesn't fit: a bottom sheet. Remount it (by key) per booking. */
export function NewAppointmentSheet(props: SlotBookingProps) {
  const { t } = useTranslation("common");
  return (
    <Drawer onOpenChange={(open) => { if (!open) props.onClose(); }} open showSwipeHandle swipeDirection="down">
      <DrawerContent className="max-h-[90svh]">
        <DrawerHeader><DrawerTitle>{t("appointments.create.title")}</DrawerTitle></DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden px-4">
          <AppointmentForm businessId={props.businessId} Footer={DrawerButtons} initialStartsAt={props.startsAt} onCancel={props.onClose} onDone={props.onClose} onDraftChange={props.onDraftChange} stacked timeZone={props.timeZone} unavailable={props.unavailable} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
