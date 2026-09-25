"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useTelemetry } from "@/components/product-analytics";
import { subscribeTestCallEnded } from "@/lib/test-call-launcher";
import {
  captureSurveyDismissed,
  captureSurveyResponse,
  captureSurveyShown,
} from "@/lib/abandon-intent-survey";
import {
  ABANDON_INTENT_CALL_GRACE_MS,
  ABANDON_INTENT_IDLE_MS,
  ABANDON_INTENT_MIN_DWELL_MS,
  canPromptAbandonIntent,
  isExitIntentEvent,
  markAbandonIntentPrompted,
  type AbandonIntentTrigger,
} from "@/lib/abandon-intent";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Textarea } from "./ui/textarea";

const MAX_ANSWER_LENGTH = 2_000;

function browserStorage(): globalThis.Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Asks a departing operator what they were after. The questions live in a
 * PostHog survey so the answers land in its report, but the dialog is ours, so
 * it sits in the middle of the screen and matches the dashboard.
 */
export function DashboardAbandonIntent({ businessId }: { businessId: string | undefined }) {
  const { t } = useTranslation("common");
  const telemetry = useTelemetry();
  const firedRef = useRef(false);
  const callEndedAtRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState("");
  const [missing, setMissing] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => subscribeTestCallEnded(() => { callEndedAtRef.current = Date.now(); }), []);

  useEffect(() => {
    if (!businessId) return;
    const storage = browserStorage();
    const hasFinePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
    if (!canPromptAbandonIntent({ businessId, hasFinePointer, now: Date.now(), storage })) return;

    const armedAt = Date.now();
    firedRef.current = false;

    const fire = (trigger: AbandonIntentTrigger) => {
      if (firedRef.current) return;
      const now = Date.now();
      if (now - armedAt < ABANDON_INTENT_MIN_DWELL_MS) return;
      // A call just ended: that moment belongs to the upgrade prompt.
      if (callEndedAtRef.current !== null && now - callEndedAtRef.current < ABANDON_INTENT_CALL_GRACE_MS) return;
      firedRef.current = true;
      markAbandonIntentPrompted(businessId, now, storage);
      telemetry.track("web.activation.abandon_intent", { businessId, trigger });
      captureSurveyShown();
      setOpen(true);
    };

    const onMouseOut = (event: MouseEvent) => {
      if (isExitIntentEvent(event)) fire("exit_intent");
    };

    document.addEventListener("mouseout", onMouseOut);
    const idleTimer = window.setTimeout(() => fire("idle"), ABANDON_INTENT_IDLE_MS);

    return () => {
      document.removeEventListener("mouseout", onMouseOut);
      window.clearTimeout(idleTimer);
    };
  }, [businessId, telemetry]);

  const close = useCallback((nextOpen: boolean) => {
    if (nextOpen) return;
    // Closing with nothing written is a dismissal, not an empty answer.
    if (!sent) captureSurveyDismissed();
    setOpen(false);
  }, [sent]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captureSurveyResponse({ issue, missing })) return;
    setSent(true);
  }

  const canSubmit = Boolean(issue.trim() || missing.trim());

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent className="sm:max-w-md">
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("abandonIntent.sentTitle")}</DialogTitle>
              <DialogDescription>{t("abandonIntent.sentDescription")}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)} type="button">{t("abandonIntent.close")}</Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("abandonIntent.title")}</DialogTitle>
              <DialogDescription>{t("abandonIntent.description")}</DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={submit}>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="abandon-intent-issue">{t("abandonIntent.issue.label")}</FieldLabel>
                  <Textarea
                    autoFocus
                    className="min-h-20 rounded-xl"
                    id="abandon-intent-issue"
                    maxLength={MAX_ANSWER_LENGTH}
                    onChange={event => setIssue(event.target.value)}
                    placeholder={t("abandonIntent.issue.placeholder")}
                    rows={3}
                    value={issue}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="abandon-intent-missing">{t("abandonIntent.missing.label")}</FieldLabel>
                  <Textarea
                    className="min-h-20 rounded-xl"
                    id="abandon-intent-missing"
                    maxLength={MAX_ANSWER_LENGTH}
                    onChange={event => setMissing(event.target.value)}
                    placeholder={t("abandonIntent.missing.placeholder")}
                    rows={3}
                    value={missing}
                  />
                </Field>
              </FieldGroup>
              <div className="flex items-center justify-between gap-3">
                <Button onClick={() => close(false)} type="button" variant="ghost">{t("abandonIntent.notNow")}</Button>
                <Button disabled={!canSubmit} type="submit">{t("abandonIntent.submit")}</Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
