import { FormEvent, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation } from "convex/react";
import { Command, CornerDownLeft, MessageSquarePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

const MAX_FEEDBACK_MESSAGE_LENGTH = 2_000;

type FeedbackWidgetProps = {
  businessId?: Id<"businesses">;
};

export function FeedbackWidget({ businessId }: FeedbackWidgetProps) {
  const { t } = useTranslation("common");
  const location = useLocation();
  const submitFeedback = useMutation(api.feedback.submit);
  const [open, setOpen] = useState(false);
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
      pagePath: `${location.pathname}${location.search}${location.hash}`,
      userAgent: navigator.userAgent,
    };

    setMessage("");
    setOpen(false);
    toast.success(t("feedback.toast.sent"));

    void submitFeedback(payload).catch(() => {
      toast.error(t("feedback.toast.failed"));
    });
  }

  return (
    <div className="fixed top-4 right-4 z-40 hidden md:block">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              aria-label={t("feedback.trigger")}
              size="sm"
              type="button"
              variant="outline"
            />
          }
        >
          <MessageSquarePlus data-icon="inline-start" />
          {t("feedback.trigger")}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-96 max-w-[calc(100vw-2rem)] rounded-2xl border-border/80 bg-background p-4 shadow-xl"
          sideOffset={8}
        >
          <PopoverHeader className="sr-only">
            <PopoverTitle>{t("feedback.title")}</PopoverTitle>
            <PopoverDescription>{t("feedback.description")}</PopoverDescription>
          </PopoverHeader>
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
                  className="min-h-28 rounded-xl border-border/80 bg-muted/30 px-3 py-3 text-sm placeholder:text-muted-foreground/70 focus-visible:ring-ring/40"
                />
              </Field>
            </FieldGroup>
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-sm text-muted-foreground">
                {t("feedback.helpText")}{" "}
                <a className="text-primary hover:underline" href="mailto:raphael.morency@icloud.com">
                  {t("feedback.contactLink")}
                </a>{" "}
                {t("feedback.helpTextSeparator")}{" "}
                <a className="text-primary hover:underline" href="/docs">
                  {t("feedback.docsLink")}
                </a>
              </p>
              <Button
                className="h-10 gap-2 rounded-3xl px-4 text-sm font-semibold"
                disabled={!canSubmit}
                type="submit"
              >
                {t("feedback.submit")}
                <span className="flex items-center gap-1 text-primary-foreground/70">
                  <span className="flex size-6 items-center justify-center rounded-lg bg-primary-foreground/15">
                    <Command className="size-3.5" />
                  </span>
                  <span className="flex size-6 items-center justify-center rounded-lg bg-primary-foreground/15">
                    <CornerDownLeft className="size-3.5" />
                  </span>
                </span>
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
