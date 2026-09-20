"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import posthog from "posthog-js";
import { createBrowserTelemetry, type BrowserTelemetry } from "@lobbystack/telemetry/browser";
import type { DeploymentMode, TelemetryEventName } from "@lobbystack/telemetry";
import { selectActiveBusiness } from "@/lib/active-business";
import { consumeAuthSuccess } from "@/lib/auth-success-analytics";
import { requestJson } from "@/lib/request-json";

const SENSITIVE_ROUTE_PATTERN = /^\/(login|signup|forgot-password|reset-password|confirm-email-change|accept-invite|claim-demo|demo|demos|embed)(\/|$)/;

/** Authentication, prospect demo, and widget surfaces never capture or record. */
export function isSensitiveAnalyticsRoute(pathname: string): boolean {
  return SENSITIVE_ROUTE_PATTERN.test(pathname);
}

const PAGE_EVENTS: ReadonlyArray<readonly [RegExp, TelemetryEventName]> = [
  [/^\/$/, "web.page.home_viewed"],
  [/^\/calls$/, "web.page.calls_viewed"],
  [/^\/calls\/[^/]+$/, "web.page.call_detail_viewed"],
  [/^\/messages(?:\/|$)/, "web.page.messages_viewed"],
  [/^\/contacts(?:\/|$)/, "web.page.contacts_viewed"],
  [/^\/analytics(?:\/|$)/, "web.page.analytics_viewed"],
  [/^\/agent(?:\/|$)/, "web.page.agent_viewed"],
  [/^\/settings(?:\/|$)/, "web.page.settings_viewed"],
];

export function resolvePageEvent(pathname: string): TelemetryEventName | undefined {
  return PAGE_EVENTS.find(([pattern]) => pattern.test(pathname))?.[1];
}

const AnalyticsTelemetryContext = createContext<BrowserTelemetry | null>(null);

export function useTelemetry(): BrowserTelemetry {
  const telemetry = useContext(AnalyticsTelemetryContext);
  if (!telemetry) throw new Error("useTelemetry must be used within ProductAnalytics.");
  return telemetry;
}

export function ProductAnalytics({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const sensitive = isSensitiveAnalyticsRoute(pathname ?? "");
  const session = useQuery({ queryKey: ["product-analytics-session"], enabled: Boolean(projectToken) && !sensitive, retry: false, staleTime: 0, refetchOnMount: "always", queryFn: () => requestJson<{ user?: { id?: string } } | null>("/api/auth/get-session") });
  // Do not reuse a cached identity after a sign-out or a different user logs in.
  const userId = session.isSuccess && !session.isFetching ? session.data?.user?.id : undefined;
  const businesses = useQuery({ queryKey: ["businesses"], enabled: Boolean(projectToken) && !sensitive, retry: false, queryFn: () => requestJson<{ businesses: Array<{ businessId: string; active: boolean }> }>("/api/businesses") });
  const businessId = selectActiveBusiness(businesses.data?.businesses)?.businessId;
  const preference = useQuery({ queryKey: ["appearance-preferences", businessId], enabled: Boolean(projectToken && businessId) && !sensitive, retry: false, queryFn: () => requestJson<{ telemetryEnabled: boolean }>(`/api/preferences/appearance?businessId=${encodeURIComponent(businessId!)}`) });
  const allowed = Boolean(projectToken && userId && businessId && preference.data?.telemetryEnabled === true && !sensitive);
  const telemetryRef = useRef<BrowserTelemetry | null>(null);
  const allowedRef = useRef(false);
  allowedRef.current = allowed;
  // The SDK initializes opted out, so no event is collected before the tenant
  // and route checks below grant consent.
  if (!telemetryRef.current) telemetryRef.current = createBrowserTelemetry(posthog, {
    optedOut: true,
    deploymentMode: (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? "development") as DeploymentMode,
  });

  useEffect(() => {
    const telemetry = telemetryRef.current;
    if (!telemetry) return;
    if (!allowed) {
      // Drop any identity carried in from the previous page before opting out,
      // so a sensitive route cannot be attributed to the operator.
      if (sensitive) telemetry.reset();
      telemetry.setOptOut(true);
      telemetry.setSensitiveRoute(sensitive);
      if (!sensitive && businessId && preference.data?.telemetryEnabled === false) consumeAuthSuccess();
      return;
    }
    // Granting consent captures the current page as a pageview; later
    // navigations are captured by capture_pageview: history_change.
    telemetry.setOptOut(false);
    telemetry.setSensitiveRoute(false);
    const distinctId = `user:${userId}`;
    const businessGroup = `business:${businessId}`;
    // An operator remains one person while moving between workspaces. The group
    // is updated for the active workspace and the identifier is registered as an
    // event property so historical attribution cannot depend on browser state.
    posthog.identify(distinctId);
    posthog.register({ businessId });
    posthog.group("business", businessGroup);
    const authEvent = consumeAuthSuccess();
    if (authEvent) telemetry.track(authEvent, { businessId, pathname: pathname ?? "/", $groups: { business: businessGroup } });
  }, [allowed, businessId, pathname, preference.data?.telemetryEnabled, sensitive, userId]);
  useEffect(() => {
    if (!allowed || !pathname || !businessId) return;
    const event = resolvePageEvent(pathname);
    if (event) telemetryRef.current?.track(event, { businessId, pathname });
  }, [allowed, businessId, pathname]);
  useEffect(() => {
    if (!allowed) return;
    const report = (error: unknown) => {
      void import("@/lib/browser-error-reporting").then(({ captureBrowserError }) => {
        if (allowedRef.current) captureBrowserError(error);
      }).catch(() => {});
    };
    const onError = (event: ErrorEvent) => report(event.error);
    const onRejection = (event: PromiseRejectionEvent) => report(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, [allowed]);
  return <AnalyticsTelemetryContext.Provider value={telemetryRef.current}>{children}</AnalyticsTelemetryContext.Provider>;
}
