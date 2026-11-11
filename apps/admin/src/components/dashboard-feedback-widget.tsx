"use client";

import { type FormEvent, useState } from "react";

import { brandLinks, contactEmailFor } from "@lobbystack/shared";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useBranding } from "@/components/branding-provider";

const MAX_FEEDBACK_MESSAGE_LENGTH = 2_000;

type FeedbackDialogProps = {
  businessId?: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Feedback to the team that runs the dashboard, which the account menu opens. It sends in the background and closes at once. */
export function DashboardFeedbackDialog({ businessId, onOpenChange, open }: FeedbackDialogProps) {
  const { t } = useTranslation("common");
  const links = brandLinks();
  // On a partner's pages, the partner's support link. A partner that set none
  // gets no help line, and none gets the host's docs, which partners don't have.
  const { partner } = useBranding();
  const supportHref = partner ? partner.links.support : `mailto:${contactEmailFor(links, "support")}`;
  const docsHref = partner ? null : links.docsUrl;
  async function submitFeedback(payload: { businessId?: string; message: string; pagePath: string; userAgent: string }) {
    const response = await fetch("/api/feedback", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Feedback submission failed.");
  }
  const [message, setMessage] = useState("");

  const trimmedMessage = message.trim();
  const canSubmit =
    trimmedMessage.length > 0 && trimmedMessage.length <= MAX_FEEDBACK_MESSAGE_LENGTH;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    const payload = {
      ...(businessId ? { businessId } : {}),
      message: trimmedMessage,
      pagePath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      userAgent: navigator.userAgent,
    };

    setMessage("");
    onOpenChange(false);
    toast.success(t("feedback.toast.sent"));

    void submitFeedback(payload).catch(() => {
      toast.error(t("feedback.toast.failed"));
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("feedback.title")}</DialogTitle>
          <DialogDescription>{t("feedback.description")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup className="gap-0">
            <Field data-invalid={message.length > MAX_FEEDBACK_MESSAGE_LENGTH}>
              <FieldLabel className="sr-only" htmlFor="dashboard-feedback-message">
                {t("feedback.label")}
              </FieldLabel>
              <Textarea
                aria-invalid={message.length > MAX_FEEDBACK_MESSAGE_LENGTH}
                autoFocus
                id="dashboard-feedback-message"
                maxLength={MAX_FEEDBACK_MESSAGE_LENGTH + 1}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("feedback.placeholder")}
                rows={4}
                value={message}
                className="min-h-28"
              />
            </Field>
          </FieldGroup>
          <div className="flex items-center justify-between gap-3">
            {supportHref ? <p className="min-w-0 type-body-muted">
              {t("feedback.helpText")}{" "}
              <a className="text-primary underline underline-offset-4" href={supportHref} {...(supportHref.startsWith("mailto:") ? {} : { rel: "noreferrer", target: "_blank" })}>
                {t("feedback.contactLink")}
              </a>
              {docsHref ? <>
                {" "}{t("feedback.helpTextSeparator")}{" "}
                <a
                  className="text-primary underline underline-offset-4"
                  href={docsHref}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t("feedback.docsLink")}
                </a>
              </> : null}
            </p> : <span />}
            <Button disabled={!canSubmit} size="sm" type="submit">
              {t("feedback.submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
