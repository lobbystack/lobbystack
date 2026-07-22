import { useCallback, useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";

import type { TelemetryEventName } from "@lobbystack/telemetry";
import { api } from "../../../../../convex/_generated/api";
import { AuraVoiceDemo } from "@/components/web-voice/AuraVoiceDemo";
import {
  getWebCallEndpoint,
  PROSPECT_DEMO_WIDGET_ID,
} from "@/components/web-voice/config";
import { buttonVariants } from "@/components/ui/button";
import { captureAnalyticsEvent } from "@/lib/analytics";
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

function DemoShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("demos");

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="flex w-full max-w-xl flex-col items-center">{children}</div>
      <p className="mt-16 text-xs text-muted-foreground">{t("active.poweredBy")}</p>
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

function ProspectDemoLoading() {
  const { t } = useTranslation("demos");

  return (
    <DemoShell>
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
}: {
  state: "invalid" | "preparing" | "expired" | "revoked" | "claimed";
  businessName?: string;
}) {
  const { t } = useTranslation("demos");
  const safeName = businessName?.trim();
  const title =
    state !== "invalid" && safeName
      ? t(`states.${state}.titleWithBusiness`, { businessName: safeName })
      : t(`states.${state}.title`);

  return (
    <DemoShell>
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

  const prompts: string[] = suggestedPrompts.slice(0, 2);

  return (
    <DemoShell>
      <div className="flex w-full flex-col items-center text-center">
        <p className="text-sm font-medium text-muted-foreground">
          {t("active.eyebrow")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {t("active.title", { businessName: demo.businessName })}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {t("active.knowledgeNotice", { businessName: demo.businessName })}
        </p>

        <AuraVoiceDemo
          auraTone="light"
          businessSlug={businessSlug}
          className="mt-8 max-w-sm"
          endpoint={getWebCallEndpoint()}
          getStartPayload={getStartPayload}
          onEvent={handleEvent}
          widgetId={PROSPECT_DEMO_WIDGET_ID}
        />

        <p className="mt-4 text-sm text-muted-foreground">{t("active.startHint")}</p>

        {prompts.length > 0 ? (
          <div className="mt-8 w-full">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("active.promptsTitle")}
            </p>
            <ul className="mt-3 flex flex-col gap-3">
              {prompts.map((prompt) => (
                <li
                  key={prompt}
                  className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-foreground"
                >
                  {prompt}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-8 max-w-md text-xs leading-5 text-muted-foreground">
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
    </DemoShell>
  );
}

export function ProspectDemoPage() {
  useNoIndexMeta();
  const { token } = useParams<{ token: string }>();
  const preview = useQuery(
    api.demos.previewProspectDemo,
    token ? { token } : "skip",
  );

  if (!token) {
    return <ProspectDemoInactive state="invalid" />;
  }

  if (preview === undefined) {
    return <ProspectDemoLoading />;
  }

  if (preview.state === "active") {
    return <ProspectDemoActive demo={preview} token={token} />;
  }

  return (
    <ProspectDemoInactive
      state={preview.state}
      {...("businessName" in preview && preview.businessName
        ? { businessName: preview.businessName }
        : {})}
    />
  );
}
