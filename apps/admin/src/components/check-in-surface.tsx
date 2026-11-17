"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { LOBBYSTACK_DOCS_URL, brandLinks, type CheckInAnswer } from "@lobbystack/shared";

import { forwardingHelpUrl } from "@/lib/forwarding-help";
import { resolveLocale } from "@/lib/locale";
import { ReplacementOnboardingShell } from "./replacement-onboarding-shell";
import { Button } from "./ui/button";

function agentDocsUrl(language: string): string {
  const { docsUrl } = brandLinks();
  const localized = docsUrl === LOBBYSTACK_DOCS_URL && (language === "fr" || language === "es");
  return `${docsUrl}${localized ? `/${language}` : ""}/agent/overview`;
}

/** Where each answer sends the owner next. */
function nextStep(answer: CheckInAnswer, language: string): { href: string; external: boolean } {
  if (answer === "still_testing") return { href: "/", external: false };
  if (answer === "connect_number") return { href: forwardingHelpUrl(language), external: true };
  if (answer === "test_call_mistakes") return { href: "/business/knowledge", external: false };
  return { href: agentDocsUrl(language), external: true };
}

export function CheckInSurface({ answer, token }: { answer: CheckInAnswer | null; token: string }) {
  const { t, i18n } = useTranslation("auth");
  const language = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const [state, setState] = useState<"ready" | "saving" | "done" | "failed" | "invalid">(answer ? "ready" : "invalid");

  async function confirm() {
    setState("saving");
    try {
      const response = await fetch("/api/check-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      setState(response.ok ? "done" : response.status === 400 ? "invalid" : "failed");
    } catch {
      setState("failed");
    }
  }

  if (!answer || state === "invalid") {
    return <div className="ph-no-capture"><ReplacementOnboardingShell description={t("checkIn.invalid.description")} progress={null} title={t("checkIn.invalid.title")} width="sm">{null}</ReplacementOnboardingShell></div>;
  }

  if (state === "done") {
    const step = nextStep(answer, language);
    return <div className="ph-no-capture"><ReplacementOnboardingShell description={t(`checkIn.next.${answer}.description`)} progress={null} title={t(`checkIn.next.${answer}.title`)} width="sm"><div className="flex flex-col gap-6">
      <Button className="w-full" nativeButton={false} render={<Link href={step.href} {...(step.external ? { rel: "noreferrer", target: "_blank" } : {})} />}>{t(`checkIn.next.${answer}.action`)}</Button>
      <p className="text-center type-body-muted">{t("checkIn.next.reply")}</p>
    </div></ReplacementOnboardingShell></div>;
  }

  return <div className="ph-no-capture"><ReplacementOnboardingShell description={t(`checkIn.answers.${answer}`)} progress={null} title={t("checkIn.confirm.title")} width="sm"><div className="flex flex-col gap-4">
    {state === "failed" ? <p className="text-center type-body text-destructive" role="alert">{t("checkIn.confirm.failed")}</p> : null}
    <Button className="w-full" loading={state === "saving"} loadingLabel={t("checkIn.confirm.saving")} onClick={() => void confirm()} type="button">{t("checkIn.confirm.action")}</Button>
  </div></ReplacementOnboardingShell></div>;
}
