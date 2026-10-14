"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { cancellationReasons, type CancellationReason } from "@/lib/billing-cancellation";
import { formatDateTime } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "./ui/field";
import { Textarea } from "./ui/textarea";

/** Asks one optional question, then cancels the paid plan at the end of the period. */
export function CancelPlanDialog({ businessId, plan, periodEnd, onCanceled }: { businessId: string; plan: string; periodEnd: string | null; onCanceled: (endsAt: string | null) => void }) {
  const { i18n, t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [comment, setComment] = useState("");
  const cancel = useMutation({
    mutationFn: () => requestJson<{ endsAt: string | null }>(`/api/billing/cancel?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({ ...(reason ? { reason } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) }) }),
    onSuccess: ({ endsAt }) => { setOpen(false); onCanceled(endsAt); },
    meta: { inlineError: true },
  });
  const endDate = periodEnd ? formatDateTime(periodEnd, i18n.language, { month: "long", day: "numeric", year: "numeric" }) : null;

  return (
    <Dialog onOpenChange={(next) => { if (!cancel.isPending) setOpen(next); }} open={open}>
      <DialogTrigger render={<Button className="w-full sm:w-auto" size="sm" variant="outline" />}>{t("billing.actions.cancelPlan")}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("billing.cancel.title", { plan })}</DialogTitle>
          <DialogDescription>{endDate ? t("billing.cancel.description", { date: endDate }) : t("billing.cancel.descriptionNoDate")}</DialogDescription>
        </DialogHeader>
        <FieldSet className="gap-0">
          <FieldLegend variant="label">{t("billing.cancel.reasonLabel")}</FieldLegend>
          <div className="flex flex-col gap-2">
            {cancellationReasons.map((key) => (
              <button
                aria-pressed={reason === key}
                className={cn("rounded-xl border px-4 py-2.5 text-left text-sm transition-colors", reason === key ? "border-foreground bg-muted font-medium text-foreground" : "border-border text-foreground hover:border-foreground/30")}
                disabled={cancel.isPending}
                key={key}
                onClick={() => setReason(reason === key ? null : key)}
                type="button"
              >
                {t(`billing.cancel.reasons.${key}`)}
              </button>
            ))}
          </div>
        </FieldSet>
        <Field>
          <FieldLabel htmlFor="cancel-plan-comment">{t("billing.cancel.commentLabel")}</FieldLabel>
          <Textarea disabled={cancel.isPending} id="cancel-plan-comment" maxLength={2_000} onChange={(event) => setComment(event.target.value)} value={comment} />
        </Field>
        {cancel.isError ? <FieldError>{t("billing.cancel.failed")}</FieldError> : null}
        <DialogFooter>
          <DialogClose render={<Button disabled={cancel.isPending} type="button" variant="outline" />}>{t("billing.cancel.keep")}</DialogClose>
          <Button loading={cancel.isPending} loadingLabel={t("billing.cancel.canceling")} onClick={() => cancel.mutate()} type="button" variant="destructive">{t("billing.cancel.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
