"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ReplacementOnboardingShell } from "./replacement-onboarding-shell";
import { Button } from "./ui/button";

type Shown = "subscribed" | "unsubscribed" | "resubscribed" | "invalid";

/**
 * The page a marketing email's Unsubscribe link opens. Opening it changes
 * nothing; its one button unsubscribes, and then offers to resubscribe.
 */
export function UnsubscribeSurface({ initial, token }: { initial: "subscribed" | "unsubscribed" | "invalid"; token: string }) {
  const { t } = useTranslation("auth");
  const [shown, setShown] = useState<Shown>(initial);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(subscribed: boolean) {
    setSaving(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/email/${subscribed ? "subscribe" : "unsubscribe"}?token=${encodeURIComponent(token)}`, { method: "POST" });
      if (response.ok) setShown(subscribed ? "resubscribed" : "unsubscribed");
      else if (response.status === 400) setShown("invalid");
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (shown === "invalid") {
    return <div className="ph-no-capture"><ReplacementOnboardingShell description={t("unsubscribe.invalid.description")} progress={null} title={t("unsubscribe.invalid.title")} width="sm">{null}</ReplacementOnboardingShell></div>;
  }

  const subscribed = shown !== "unsubscribed";
  const copy = shown === "subscribed" ? "confirm" : shown === "unsubscribed" ? "done" : "resubscribed";
  return <div className="ph-no-capture"><ReplacementOnboardingShell description={copy === "confirm" ? t("unsubscribe.confirm.description") : undefined} progress={null} title={t(`unsubscribe.${copy}.title`)} width="sm"><div className="flex flex-col gap-4">
    {failed ? <p className="text-center type-body text-destructive" role="alert">{t("unsubscribe.failed")}</p> : null}
    <Button className="w-full" disabled={saving} onClick={() => void save(!subscribed)} type="button" variant={subscribed ? "default" : "outline"}>
      {saving ? t(subscribed ? "unsubscribe.unsubscribing" : "unsubscribe.resubscribing") : t(subscribed ? "unsubscribe.unsubscribe" : "unsubscribe.resubscribe")}
    </Button>
  </div></ReplacementOnboardingShell></div>;
}
