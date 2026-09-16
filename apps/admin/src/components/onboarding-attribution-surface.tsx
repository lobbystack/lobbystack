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

function XLogo(props: SVGProps<SVGSVGElement>) {
  return <svg fill="currentColor" viewBox="0 0 24 24" {...props}><path d="M13.9 10.47 21.35 2h-1.76l-6.47 7.35L7.96 2H2l7.81 11.12L2 22h1.76l6.83-7.76L16.04 22H22l-8.1-11.53Zm-2.42 2.75-.79-1.11L4.4 3.3h2.72l5.08 7.12.79 1.11 6.6 9.25h-2.72l-5.39-7.56Z" /></svg>;
}

function RedditLogo(props: SVGProps<SVGSVGElement>) {
  return <svg fill="currentColor" viewBox="0 0 24 24" {...props}><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.587.545a1.25 1.25 0 0 1 1.249-1.25zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" /></svg>;
}

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
  { key: "x", Icon: XLogo },
  { key: "reddit", Icon: RedditLogo },
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
