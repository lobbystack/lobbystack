"use client";

import { useState, type ComponentType, type SVGProps } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bot,
  Briefcase,
  Facebook,
  GraduationCap,
  Instagram,
  Linkedin,
  LoaderCircle,
  MessageCircleQuestion,
  Mic,
  Music2,
  Newspaper,
  Rss,
  Search,
  Youtube,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { clearAffiliateReferralCode, getStoredAffiliateReferralCode } from "@/lib/affiliate-referral";
import { cn } from "@/lib/utils";

type Business = { businessId: string; active: boolean };
type AttributionSource = "ai_assistant" | "newsletter" | "podcast" | "news" | "work" | "school" | "x" | "reddit" | "facebook" | "youtube" | "instagram" | "linkedin" | "google" | "tiktok" | "other";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const options: Array<{ key: AttributionSource; Icon: Icon }> = [
  { key: "google", Icon: Search },
  { key: "ai_assistant", Icon: Bot },
  { key: "youtube", Icon: Youtube },
  { key: "newsletter", Icon: Rss },
  { key: "work", Icon: Briefcase },
  { key: "podcast", Icon: Mic },
  { key: "instagram", Icon: Instagram },
  { key: "news", Icon: Newspaper },
  { key: "linkedin", Icon: Linkedin },
  { key: "x", Icon: MessageCircleQuestion },
  { key: "reddit", Icon: MessageCircleQuestion },
  { key: "facebook", Icon: Facebook },
  { key: "school", Icon: GraduationCap },
  { key: "tiktok", Icon: Music2 },
  { key: "other", Icon: MessageCircleQuestion },
];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function OnboardingAttributionSurface() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const [selected, setSelected] = useState<AttributionSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const finish = useMutation({
    mutationFn: (source: AttributionSource | null) => requestJson(`/api/onboarding/attribution?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ source, referralCode: getStoredAffiliateReferralCode() }) }),
    onSuccess: () => {
      clearAffiliateReferralCode();
      router.push("/");
      router.refresh();
    },
  });

  async function submit(source: AttributionSource | null) {
    setError(null);
    try {
      await finish.mutateAsync(source);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("attribution.submitFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:[grid-template-columns:repeat(4,minmax(200px,1fr))]">
        {options.map(({ key, Icon }) => {
          const active = selected === key;
          return <button aria-pressed={active} className={cn("flex h-24 items-center gap-3 rounded-xl border px-4 text-left text-sm font-medium transition-colors", active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:border-foreground/30")} key={key} onClick={() => setSelected(key)} type="button"><Icon aria-hidden="true" className={cn("size-4 shrink-0", active ? "text-background" : "text-muted-foreground")} /><span className="min-w-0 whitespace-normal break-words leading-snug">{t(`attribution.options.${key}`)}</span></button>;
        })}
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <Button className="h-11 w-full" disabled={!business || selected === null || finish.isPending} onClick={() => void submit(selected)} type="button">{finish.isPending ? <><LoaderCircle className="size-4 animate-spin" />{t("attribution.finishing")}</> : t("attribution.finish")}</Button>
      <button className="mx-auto text-sm text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={!business || finish.isPending} onClick={() => void submit(null)} type="button">{t("attribution.skip")}</button>
    </div>
  );
}
