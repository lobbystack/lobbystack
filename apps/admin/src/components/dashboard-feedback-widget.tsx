"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CircleQuestionMark, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const MAX_FEEDBACK_MESSAGE_LENGTH = 2_000;

export function DashboardFeedbackWidget({ businessId, className }: { businessId: string; className?: string }) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const canSubmit = message.trim().length > 0 && message.trim().length <= MAX_FEEDBACK_MESSAGE_LENGTH;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    const response = await fetch(`/api/feedback?businessId=${encodeURIComponent(businessId)}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: message.trim(), pagePath: `${window.location.pathname}${window.location.search}${window.location.hash}`, userAgent: navigator.userAgent }),
    });

    if (!response.ok) {
      toast.error(t("feedback.toast.failed"));
      return;
    }

    setMessage("");
    setOpen(false);
    toast.success(t("feedback.toast.sent"));
  }

  return (
    <div className={cn("-mr-1 hidden items-center gap-1 md:flex", className)}>
      <div className="relative" ref={popoverRef}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-expanded={open}
                aria-label={t("feedback.trigger")}
                className="text-sidebar-foreground hover:bg-transparent hover:text-sidebar-accent-foreground aria-expanded:bg-transparent"
                onClick={() => setOpen((current) => !current)}
                size="icon-xs"
                type="button"
                variant="ghost"
              />
            }
          >
            <MessageSquare className="size-[18px]" strokeWidth={1.75} />
          </TooltipTrigger>
          <TooltipContent>{t("feedback.trigger")}</TooltipContent>
        </Tooltip>
        {open ? (
          <div className="absolute top-8 right-0 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-border/80 bg-background p-4 shadow-xl">
            <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
              <textarea
                aria-label={t("feedback.label")}
                autoFocus
                className="min-h-28 resize-y rounded-xl border border-border/80 bg-muted/30 px-3 py-3 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/40"
                maxLength={MAX_FEEDBACK_MESSAGE_LENGTH}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("feedback.placeholder")}
                rows={4}
                value={message}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-sm text-muted-foreground">
                  {t("feedback.helpText")} {" "}
                  <a className="text-primary underline underline-offset-4" href="mailto:support@lobbystack.com">{t("feedback.contactLink")}</a>{" "}
                  {t("feedback.helpTextSeparator")} {" "}
                  <a className="text-primary underline underline-offset-4" href="https://docs.lobbystack.com" rel="noreferrer" target="_blank">{t("feedback.docsLink")}</a>
                </p>
                <Button disabled={!canSubmit} size="sm" type="submit">{t("feedback.submit")}</Button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={t("feedback.helpCenter")}
              className="text-sidebar-foreground hover:bg-transparent hover:text-sidebar-accent-foreground"
              nativeButton={false}
              render={<a href="https://docs.lobbystack.com" rel="noreferrer" target="_blank" />}
              size="icon-xs"
              variant="ghost"
            />
          }
        >
          <CircleQuestionMark className="size-[18px]" strokeWidth={1.75} />
        </TooltipTrigger>
        <TooltipContent>{t("feedback.helpCenter")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
