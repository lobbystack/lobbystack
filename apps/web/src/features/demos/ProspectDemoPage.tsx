import { useCallback, useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";

import type { TelemetryEventName } from "@lobbystack/telemetry";
import { api } from "../../../../../convex/_generated/api";
import { AuraVoiceDemo } from "@/components/web-voice/AuraVoiceDemo";
import { LandingNavbar } from "@/components/marketing/landing-navbar";
import {
  getWebCallEndpoint,
  PROSPECT_DEMO_WIDGET_ID,
} from "@/components/web-voice/config";
import { buttonVariants } from "@/components/ui/button";
import { captureAnalyticsEvent } from "@/lib/analytics";
import type { MarketingLocale } from "@/lib/marketing-site-url";
import { cn } from "@/lib/utils";

const CALL_EVENT_MAP: Partial<Record<TelemetryEventName, TelemetryEventName>> = {
  "web.voice.test_call_started": "web.prospect_demo.call_started",
  "web.voice.test_call_ended": "web.prospect_demo.call_completed",
  "web.voice.test_call_error": "web.prospect_demo.call_error",
};

type ProspectDemoPreview = NonNullable<
  ReturnType<typeof useQuery<typeof api.demos.previewProspectDemo>>
>;

type ActiveProspectDemo = Extract<ProspectDemoPreview, { state: "active" }>;

function useNoIndexMeta(): void {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "robots");
    meta.setAttribute("content", "noindex, nofollow");
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);
}

function useForceLightTheme(): void {
  const { setTheme } = useTheme();

  useEffect(() => {
    const previousTheme = localStorage.getItem("theme");
    setTheme("light");

    return () => {
      setTheme(
        previousTheme === "light" ||
          previousTheme === "dark" ||
          previousTheme === "system"
          ? previousTheme
          : "system",
      );
    };
  }, [setTheme]);
}

function resolveMarketingLocale(
  demoLocale: string | undefined,
  language: string,
): MarketingLocale {
  const candidate = demoLocale?.trim().toLowerCase() ?? language.trim().toLowerCase();
  if (candidate === "fr" || candidate.startsWith("fr-")) {
    return "fr";
  }
  return "en";
}

function DemoShell({
  children,
  wide = false,
  footer,
  marketingLocale = "en",
}: {
  children: React.ReactNode;
  wide?: boolean;
  footer?: string;
  marketingLocale?: MarketingLocale;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <LandingNavbar locale={marketingLocale} />
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div
          className={cn(
            "flex w-full flex-col items-center",
            wide ? "max-w-7xl" : "max-w-xl",
          )}
        >
          {children}
        </div>
        {footer ? (
          <p className="mt-16 text-sm text-muted-foreground">{footer}</p>
        ) : null}
      </div>
    </div>
  );
}

function DemoStateCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="w-full rounded-xl border bg-muted/30 p-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function ProspectDemoLoading({
  marketingLocale,
}: {
  marketingLocale: MarketingLocale;
}) {
  const { t } = useTranslation("demos");

  return (
    <DemoShell marketingLocale={marketingLocale}>
      <div className="flex flex-col items-center gap-3 text-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("loading.description")}</p>
      </div>
    </DemoShell>
  );
}

function ProspectDemoInactive({
  state,
  businessName,
  marketingLocale,
}: {
  state: "invalid" | "preparing" | "expired" | "revoked" | "claimed";
  businessName?: string;
  marketingLocale: MarketingLocale;
}) {
  const { t } = useTranslation("demos");
  const safeName = businessName?.trim();
  const title =
    state !== "invalid" && safeName
      ? t(`states.${state}.titleWithBusiness`, { businessName: safeName })
      : t(`states.${state}.title`);

  return (
    <DemoShell marketingLocale={marketingLocale}>
      <DemoStateCard title={title} description={t(`states.${state}.description`)} />
    </DemoShell>
  );
}

function ProspectDemoActive({
  demo,
  token,
}: {
  demo: ActiveProspectDemo;
  token: string;
}) {
  const { t } = useTranslation("demos");
  const { demoId, campaignId, businessSlug, suggestedPrompts, signupPath } = demo;

  useEffect(() => {
    captureAnalyticsEvent("web.prospect_demo.viewed", {
      prospectDemoId: String(demoId),
      campaignId,
    });
  }, [campaignId, demoId]);

  const handleEvent = useCallback(
    (eventName: TelemetryEventName) => {
      const mapped = CALL_EVENT_MAP[eventName];
      if (!mapped) {
        return;
      }
      captureAnalyticsEvent(mapped, {
        prospectDemoId: String(demoId),
        campaignId,
      });
    },
    [campaignId, demoId],
  );

  const getStartPayload = useCallback(
    async () => ({ prospectDemoToken: token }),
    [token],
  );

  const handleSignupClick = useCallback(() => {
    captureAnalyticsEvent("web.prospect_demo.signup_clicked", {
      prospectDemoId: String(demoId),
      campaignId,
    });
  }, [campaignId, demoId]);

  const prompts: string[] = suggestedPrompts.slice(0, 3);

  return (
    <DemoShell wide footer={t("active.startHint")} marketingLocale={demo.locale}>
      <div className="flex w-full flex-col items-center text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {t("active.title", { businessName: demo.businessName })}
        </h1>
      </div>

      <div className="mt-10 grid w-full min-w-0 items-center gap-10 md:gap-12 xl:grid-cols-2 xl:gap-16">
        <div className="flex w-full min-w-0 flex-col text-left">
          {prompts.length > 0 ? (
            <div className="w-full max-w-md">
              <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                {t("active.promptsTitle")}
              </h2>
              <ul className="mt-3 list-disc space-y-3 pl-5 text-base leading-6 text-foreground">
                {prompts.map((prompt) => (
                  <li key={prompt}>{prompt}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <p
            className={cn(
              "max-w-md text-xs leading-5 text-muted-foreground",
              prompts.length > 0 ? "mt-8" : "mt-0",
            )}
          >
            {t("active.intakeNotice")}
          </p>

          <Link
            className={cn(buttonVariants(), "mt-8 h-11 w-full max-w-sm")}
            onClick={handleSignupClick}
            to={signupPath}
          >
            {t("active.claimCta")}
          </Link>
        </div>

        <div className="flex w-full min-w-0 justify-center xl:justify-end">
          <div className="flex w-full max-w-[22rem] flex-col items-center md:max-w-[30rem]">
            <AuraVoiceDemo
              auraTone="light"
              businessSlug={businessSlug}
              className="w-full"
              endpoint={getWebCallEndpoint()}
              getStartPayload={getStartPayload}
              onEvent={handleEvent}
              widgetId={PROSPECT_DEMO_WIDGET_ID}
            />
          </div>
        </div>
      </div>
    </DemoShell>
  );
}

export function ProspectDemoPage() {
  useNoIndexMeta();
  useForceLightTheme();
  const { i18n } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const preview = useQuery(
    api.demos.previewProspectDemo,
    token ? { token } : "skip",
  );
  const marketingLocale = resolveMarketingLocale(
    preview && "locale" in preview ? preview.locale : undefined,
    i18n.language,
  );

  if (!token) {
    return <ProspectDemoInactive marketingLocale={marketingLocale} state="invalid" />;
  }

  if (preview === undefined) {
    return <ProspectDemoLoading marketingLocale={marketingLocale} />;
  }

  if (preview.state === "active") {
    return <ProspectDemoActive demo={preview} token={token} />;
  }

  return (
    <ProspectDemoInactive
      marketingLocale={marketingLocale}
      state={preview.state}
      {...("businessName" in preview && preview.businessName
        ? { businessName: preview.businessName }
        : {})}
    />
  );
}
