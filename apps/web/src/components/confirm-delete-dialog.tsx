"use client"

import { useCallback } from "react"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type ConfirmDeleteDialogProps = {
  cancelLabel: string
  confirmLabel: string
  description: string
  onConfirm: () => Promise<void> | void
  onOpenChange: (open: boolean) => void
  open: boolean
  pending?: boolean
  title: string
}

export function ConfirmDeleteDialog({
  cancelLabel,
  confirmLabel,
  description,
  onConfirm,
  onOpenChange,
  open,
  pending = false,
  title,
}: ConfirmDeleteDialogProps) {
  const handleConfirm = useCallback(async () => {
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // Leave the dialog open so the caller can surface the failure state.
    }
  }, [onConfirm, onOpenChange])

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
              void handleConfirm()
            }}
            type="button"
            variant="destructive"
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
