"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { selectActiveBusiness } from "@/lib/active-business";
import { Button } from "./ui/button";
import { DashboardTestCallWidget } from "./dashboard-test-call-widget";

type Business = { businessId: string; name: string; slug: string; active: boolean; role: string };
type Billing = { account: { subscriptionState: string | null } | null };

export function DashboardUtilityBar() {
  const [feedback, setFeedback] = useState("");
  const [feedbackState, setFeedbackState] = useState<string | null>(null);
  const { t } = useTranslation("admin");
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: async () => await (await fetch("/api/businesses", { credentials: "include" })).json() as { businesses: Business[] } });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const billing = useQuery({ queryKey: ["billing", business?.businessId, "utility"], queryFn: async () => await (await fetch(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`, { credentials: "include" })).json() as Billing, enabled: Boolean(business?.businessId) });
  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!feedback.trim()) return; setFeedbackState(t("utilities.feedbackSending")); const response = await fetch(`/api/feedback${business ? `?businessId=${encodeURIComponent(business.businessId)}` : ""}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: feedback.trim(), pagePath: window.location.pathname }) }); setFeedbackState(response.ok ? t("utilities.feedbackSent") : t("utilities.feedbackFailed")); if (response.ok) setFeedback(""); }
  if (!business) return null;
  const pastDue = ["past_due", "incomplete", "blocked"].includes(billing.data?.account?.subscriptionState ?? "");
  return <div className="border-b bg-muted/30 px-4 py-2 sm:px-6"><div className="flex flex-wrap items-center gap-2 text-xs"><DashboardTestCallWidget businessId={business.businessId} businessSlug={business.slug} /><Link className="rounded-full px-3 py-1.5 font-medium text-muted-foreground hover:bg-background hover:text-foreground" href="/setup-guide">{t("utilities.setupGuide")}</Link><Link className="rounded-full px-3 py-1.5 font-medium text-muted-foreground hover:bg-background hover:text-foreground" href="/affiliate">{t("utilities.affiliate")}</Link><Link className="rounded-full px-3 py-1.5 font-medium text-muted-foreground hover:bg-background hover:text-foreground" href="/appointments">{t("utilities.appointments")}</Link><Link className="rounded-full px-3 py-1.5 font-medium text-muted-foreground hover:bg-background hover:text-foreground" href="/demos">{t("utilities.demos")}</Link>{pastDue ? <Link className="rounded-full bg-amber-100 px-3 py-1.5 font-medium text-amber-900" href="/settings/plan">{t("utilities.billingAttention")}</Link> : null}<form className="ml-auto flex items-center gap-2" onSubmit={(event) => void submitFeedback(event)}><input aria-label={t("utilities.feedback")} className="hidden min-h-8 w-40 rounded-full border bg-background px-3 text-xs sm:block" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder={t("utilities.feedbackPlaceholder")} /><Button disabled={!feedback.trim() || feedbackState === t("utilities.feedbackSending")} size="sm" type="submit" variant="ghost">{feedbackState ?? t("utilities.feedback")}</Button></form></div></div>;
}
