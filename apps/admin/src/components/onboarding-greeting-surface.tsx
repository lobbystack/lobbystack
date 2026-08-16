"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; active: boolean };
type Profile = { greeting: string; tone: string; summary: string; bookingPolicy: string; defaultLocale?: string };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function OnboardingGreetingSurface() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const queryClient = useQueryClient();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const agent = useQuery({ queryKey: ["onboarding-agent", business?.businessId], queryFn: () => requestJson<{ profile: Profile | null; business: { defaultLocale: string } | null }>(`/api/agent?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business) });
  const [greeting, setGreeting] = useState("");
  const [locale, setLocale] = useState("en");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (agent.data?.profile) setGreeting(agent.data.profile.greeting); if (agent.data?.business?.defaultLocale) setLocale(agent.data.business.defaultLocale); }, [agent.data]);
  const save = useMutation({
    mutationFn: async () => {
      await requestJson(`/api/agent?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ greeting, locale }) });
      return await requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: "verify_phone" }) });
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["businesses"] }); router.push("/onboarding/verify-phone"); },
  });
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); try { await save.mutateAsync(); } catch (cause) { setError(cause instanceof Error ? cause.message : t("greeting.submitFailed")); } }

  return <PageSurface title={t("greeting.title")} description={t("greeting.description")}>
    <Card className="mx-auto max-w-xl"><CardHeader><CardTitle>{t("greeting.title")}</CardTitle><CardDescription>{t("greeting.description")}</CardDescription></CardHeader><CardContent><form className="space-y-5" onSubmit={(event) => void submit(event)}><label className="block space-y-2 text-sm font-medium">{t("greeting.label")}<textarea className="min-h-28 w-full rounded-xl border p-3 font-normal" required value={greeting} onChange={(event) => setGreeting(event.target.value)} placeholder={t("greeting.placeholder")} /></label><label className="block space-y-2 text-sm font-medium">{t("greeting.language")}<select className="min-h-11 w-full rounded-xl border bg-background px-3 font-normal" value={locale} onChange={(event) => setLocale(event.target.value)}><option value="en">{t("greeting.english")}</option><option value="fr">{t("greeting.french")}</option></select></label>{error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}<Button disabled={!business || save.isPending} type="submit">{save.isPending ? t("greeting.submitting") : t("greeting.continue")}</Button></form></CardContent></Card>
  </PageSurface>;
}
