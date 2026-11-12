"use client";

import { useCallback, useRef, type ReactNode } from "react";

import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmActionDialogProps = {
  cancelLabel: string;
  /** A field the choice needs, such as where something moves, between the description and the buttons. */
  children?: ReactNode;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  description: string;
  /** For example "ph-mask" when the description names a customer. */
  descriptionClassName?: string;
  onConfirm: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending?: boolean;
  /** Confirm button text while pending; defaults to the generic "Confirming...". */
  pendingLabel?: string;
  title: string;
};

export function ConfirmActionDialog({
  cancelLabel,
  children,
  confirmLabel,
  confirmVariant = "default",
  description,
  descriptionClassName,
  onConfirm,
  onOpenChange,
  open,
  pending = false,
  pendingLabel,
  title,
}: ConfirmActionDialogProps) {
  const { t } = useTranslation("common");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const handleConfirm = useCallback(async () => {
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Leave the dialog open so the caller can surface the failure state.
    }
  }, [onConfirm, onOpenChange]);

  return (
    <AlertDialog onOpenChange={(next) => { if (!pending) onOpenChange(next); }} open={open}>
      <AlertDialogContent initialFocus={confirmRef} onOverlayClick={() => { if (!pending) onOpenChange(false); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className={descriptionClassName}>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button disabled={pending} type="button" variant="outline" />}
          >
            {cancelLabel}
          </AlertDialogClose>
          <Button
            loading={pending}
            loadingLabel={pendingLabel ?? t("pending.confirming")}
            onClick={() => {
              void handleConfirm();
            }}
            ref={confirmRef}
            type="button"
            variant={confirmVariant}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
