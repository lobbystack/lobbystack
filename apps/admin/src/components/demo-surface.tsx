"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LandingNavbar } from "./marketing/landing-navbar";
import Link from "next/link";
import { buttonVariants } from "./ui/button";
import { DemoVoiceClient } from "./demo-voice-client";
import { useTheme } from "./theme-provider";
import { cn } from "@/lib/utils";

type Preview = {
  state: "preparing" | "active" | "claimed" | "revoked" | "expired" | "invalid";
  businessName?: string;
  businessSlug?: string;
  websiteUrl?: string;
  locale?: string;
  suggestedPrompts?: string[];
};

function demoToken(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get("prospect_demo_token");
}

export function DemoSurface() {
  const { i18n } = useTranslation();
  const { setTheme } = useTheme();
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    const previousTheme = localStorage.getItem("theme");
    setTheme("light");
    const value = demoToken();
    setToken(value);
    if (!value) {
      setPreview({ state: "invalid" });
      return () => setTheme(previousTheme === "light" || previousTheme === "dark" || previousTheme === "system" ? previousTheme : "system");
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const response = await fetch("/api/demo/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: value }), signal: controller.signal });
        const next = response.ok ? await response.json() as Preview : { state: "invalid" as const };
        if (controller.signal.aborted) return;
        setPreview(next);
        if (next.state === "preparing") timer = setTimeout(() => void refresh(), 1500);
      } catch {
        if (!controller.signal.aborted) setPreview({ state: "invalid" });
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
      setTheme(previousTheme === "light" || previousTheme === "dark" || previousTheme === "system" ? previousTheme : "system");
    };
  }, [setTheme]);

  const locale = (preview?.locale ?? i18n.language).toLowerCase().startsWith("fr") ? "fr" : "en";
  const t = i18n.getFixedT(locale, "demos");
  const active = preview?.state === "active";

  return <div className="flex min-h-svh flex-col bg-background text-foreground xl:h-svh xl:overflow-hidden">
    <LandingNavbar locale={locale} />
    <div className="flex flex-1 flex-col items-center px-6 pt-12 pb-8 xl:min-h-0 xl:overflow-hidden xl:pt-10 xl:pb-6">
      <div className={cn("flex w-full flex-1 flex-col items-center xl:min-h-0", active ? "max-w-7xl" : "max-w-xl justify-center")}>
        {!preview ? <div aria-busy="true" className="flex flex-col items-center gap-3 text-center" role="status"><LoaderCircle className="size-6 animate-spin text-muted-foreground" /><p className="text-sm text-muted-foreground">{t("loading.label")}</p></div> : active && token && preview.businessSlug ? <>
          <div className="flex w-full flex-col items-center pt-4 text-center"><h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{t("active.title", { businessName: preview.businessName })}</h1></div>
          <div className="mt-4 grid w-full min-w-0 flex-1 items-center gap-8 md:gap-12 xl:min-h-0 xl:grid-cols-2 xl:gap-16">
            <div className="order-1 flex w-full min-w-0 justify-center xl:order-2 xl:justify-end"><div className="flex w-full max-w-[22rem] flex-col items-center md:max-w-[30rem] lg:max-w-[min(30rem,calc(100svh-18rem))] xl:max-w-[min(100%,calc(100svh-18rem))]"><DemoVoiceClient businessSlug={preview.businessSlug} token={token} /><p className="mt-4 text-center text-sm text-muted-foreground xl:hidden">{t("active.startHint")}</p></div></div>
            <div className="order-2 flex w-full min-w-0 max-w-lg flex-col justify-self-center text-left xl:order-1 xl:max-w-none xl:justify-self-stretch">{preview.suggestedPrompts?.length ? <div className="w-full"><h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">{t("active.promptsTitle")}</h2><ul className="mt-4 list-disc space-y-4 pl-5 text-lg leading-7 text-foreground md:text-xl md:leading-8">{preview.suggestedPrompts.slice(0, 3).map((prompt) => <li key={prompt}>{prompt}</li>)}</ul></div> : null}<p className={cn("mx-auto max-w-md text-center text-xs leading-5 text-muted-foreground xl:mx-0 xl:text-left", preview.suggestedPrompts?.length ? "mt-8" : "mt-0")}>{t("active.intakeNotice")}</p><Link className={cn(buttonVariants(), "mx-auto mt-8 h-11 w-full max-w-sm xl:mx-0")} href="/signup?returnTo=%2Fclaim-demo" onClick={() => window.sessionStorage.setItem("prospect_demo_token", token)}>{t("active.claimCta")}</Link></div>
          </div><p className="mt-auto hidden shrink-0 pt-4 text-center text-sm text-muted-foreground xl:block">{t("active.startHint")}</p>
        </> : <div className="w-full rounded-xl border bg-muted/30 p-6 text-center"><h1 className="text-xl font-semibold tracking-tight text-foreground">{preview.businessName && preview.state !== "invalid" ? t(`states.${preview.state}.titleWithBusiness`, { businessName: preview.businessName }) : t(`states.${preview.state}.title`)}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{t(`states.${preview.state}.description`)}</p></div>}
      </div>
    </div>
  </div>;
}
