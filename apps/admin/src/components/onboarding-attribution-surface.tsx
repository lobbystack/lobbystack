"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; active: boolean };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function OnboardingAttributionSurface() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const finish = useMutation({
    mutationFn: () => requestJson(`/api/onboarding/attribution?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ source: source || null }) }),
    onSuccess: () => { router.push("/"); router.refresh(); },
  });
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); try { await finish.mutateAsync(); } catch (cause) { setError(cause instanceof Error ? cause.message : t("attribution.failed")); } }

  return <PageSurface title={t("attribution.title")} description="">
    <Card className="mx-auto max-w-xl"><CardHeader><CardTitle>{t("attribution.question")}</CardTitle><CardDescription>{t("attribution.description")}</CardDescription></CardHeader><CardContent><form className="space-y-5" onSubmit={(event) => void submit(event)}><label className="block space-y-2 text-sm font-medium">{t("attribution.label")}<select className="min-h-11 w-full rounded-xl border bg-background px-3 font-normal" value={source} onChange={(event) => setSource(event.target.value)}><option value="">{t("attribution.preferNot")}</option><option value="search">{t("attribution.search")}</option><option value="referral">{t("attribution.referral")}</option><option value="social">{t("attribution.social")}</option><option value="event">{t("attribution.event")}</option><option value="other">{t("attribution.other")}</option></select></label>{error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}<Button disabled={!business || finish.isPending} type="submit">{finish.isPending ? t("attribution.finishing") : t("attribution.finish")}</Button></form></CardContent></Card>
  </PageSurface>;
}
