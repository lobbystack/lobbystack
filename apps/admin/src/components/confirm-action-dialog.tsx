"use client";

import { useCallback } from "react";

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
  confirmLabel: string;
  confirmVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  description: string;
  onConfirm: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending?: boolean;
  title: string;
};

export function ConfirmActionDialog({
  cancelLabel,
  confirmLabel,
  confirmVariant = "default",
  description,
  onConfirm,
  onOpenChange,
  open,
  pending = false,
  title,
}: ConfirmActionDialogProps) {
  const handleConfirm = useCallback(async () => {
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Leave the dialog open so the caller can surface the failure state.
    }
  }, [onConfirm, onOpenChange]);

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button disabled={pending} type="button" variant="outline" />}
          >
            {cancelLabel}
          </AlertDialogClose>
          <Button
            disabled={pending}
            onClick={() => {
              void handleConfirm();
            }}
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
