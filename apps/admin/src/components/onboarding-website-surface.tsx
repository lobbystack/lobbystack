"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; active: boolean };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function OnboardingWebsiteSurface() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const add = useMutation({
    mutationFn: () => requestJson(`/api/knowledge?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ businessId: business!.businessId, title: title.trim() || sourceUrl, sourceType: "website", sourceUrl }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["businesses"] }); router.push("/onboarding/knowledge"); },
  });
  const skip = useMutation({
    mutationFn: () => requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: "knowledge" }) }),
    onSuccess: () => router.push("/onboarding/knowledge"),
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try { await add.mutateAsync(); } catch (cause) { setError(cause instanceof Error ? cause.message : t("website.submitFailed")); }
  }

  return <PageSurface title={t("website.title")} description={t("website.description")}>
    <Card className="mx-auto max-w-xl"><CardHeader><CardTitle>{t("website.title")}</CardTitle><CardDescription>{t("website.description")}</CardDescription></CardHeader><CardContent><form className="space-y-5" onSubmit={(event) => void submit(event)}><label className="block space-y-2 text-sm font-medium">{t("website.label")}<input className="min-h-11 w-full rounded-xl border px-3 font-normal" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder={t("website.placeholder")} required /></label><label className="block space-y-2 text-sm font-medium">{t("website.sourceName")}<span className="block text-xs font-normal text-muted-foreground">{t("website.sourceNameHint")}</span><input className="min-h-11 w-full rounded-xl border px-3 font-normal" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("website.sourceNamePlaceholder")} /></label>{error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}<div className="flex flex-wrap gap-3"><Button disabled={!business || add.isPending} type="submit">{add.isPending ? t("website.submitting") : t("website.continue")}</Button><Button disabled={!business || skip.isPending || add.isPending} onClick={() => skip.mutate()} type="button" variant="ghost">{skip.isPending ? t("website.skipping") : t("website.skip")}</Button></div></form></CardContent></Card>
  </PageSurface>;
}
