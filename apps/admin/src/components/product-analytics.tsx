"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import posthog from "posthog-js";
import { createBrowserTelemetry, type BrowserTelemetry } from "@lobbystack/telemetry/browser";
import type { DeploymentMode, TelemetryEventName } from "@lobbystack/telemetry";
import { isUuid } from "@lobbystack/shared";
import { useBranding } from "@/components/branding-provider";
import { selectActiveBusiness } from "@/lib/active-business";
import { consumeAuthSuccess } from "@/lib/auth-success-analytics";
import { initializeClientAnalytics } from "@/lib/client-analytics";
import { consumePendingOnboardingBusiness } from "@/lib/onboarding-analytics";
import { consumePendingPartnerSignup } from "@/lib/partner-analytics";
import { fetchPartnerSettings, partnerSettingsQueryKey } from "@/lib/partner-settings";
import { consumePendingWorkspaceSwitch } from "@/lib/workspace-analytics";
import { requestJson } from "@/lib/request-json";
import { isPublicRoutePath, stripLocalePrefix } from "@/lib/locale-path";

const SENSITIVE_APP_ROUTE_PATTERN = /^\/(demos|embed)(\/|$)/;

/** Authentication, prospect demo, and widget surfaces never capture or record. */
export function isSensitiveAnalyticsRoute(pathname: string): boolean {
  return isPublicRoutePath(pathname) || SENSITIVE_APP_ROUTE_PATTERN.test(stripLocalePrefix(pathname));
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

/**
 * Whether the page is one of the partner pages: the console, partner signup
 * and accepting an invitation to a partner's team. No business consents for
 * them, whichever one the person has open.
 */
export function isPartnerPage(pathname: string): boolean {
  return stripLocalePrefix(pathname).split("/")[1] === "partner";
}

/** The partner whose console the page is, in lowercase, or null on any other page. */
export function consolePartnerId(pathname: string): string | null {
  const [, section, partnerId] = stripLocalePrefix(pathname).split("/");
  return section === "partner" && partnerId && isUuid(partnerId) ? partnerId.toLowerCase() : null;
}

const AnalyticsTelemetryContext = createContext<BrowserTelemetry | null>(null);

export function useTelemetry(): BrowserTelemetry {
  const telemetry = useContext(AnalyticsTelemetryContext);
  if (!telemetry) throw new Error("useTelemetry must be used within ProductAnalytics.");
  return telemetry;
}

export function ProductAnalytics({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  // A partner's pages never start PostHog, so its visitors' browsers never
  // reach the host's analytics domain. Every other page but the website
  // widget starts it here, before any page below renders.
  const hostPage = useBranding().partner === null;
  if (hostPage) initializeClientAnalytics();
  const projectToken = hostPage ? process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN : undefined;
  const sensitive = isSensitiveAnalyticsRoute(pathname ?? "");
  // The console's pages ask their partner's telemetry setting for consent, and
  // the other partner pages have no partner to ask yet. Every other page asks
  // the active business's.
  const partnerPage = isPartnerPage(pathname ?? "");
  const partnerId = consolePartnerId(pathname ?? "") ?? undefined;
  const session = useQuery({ queryKey: ["product-analytics-session"], enabled: Boolean(projectToken) && !sensitive, retry: false, staleTime: 0, refetchOnMount: "always", queryFn: () => requestJson<{ user?: { id?: string } } | null>("/api/auth/get-session") });
  // Do not reuse a cached identity after a sign-out or a different user logs in.
  const userId = session.isSuccess && !session.isFetching ? session.data?.user?.id : undefined;
  const businesses = useQuery({ queryKey: ["businesses"], enabled: Boolean(projectToken) && !sensitive && !partnerPage, retry: false, queryFn: () => requestJson<{ businesses: Array<{ businessId: string; active: boolean }> }>("/api/businesses") });
  const businessId = partnerPage ? undefined : selectActiveBusiness(businesses.data?.businesses)?.businessId;
  const preference = useQuery({ queryKey: ["appearance-preferences", businessId], enabled: Boolean(projectToken && businessId) && !sensitive, retry: false, queryFn: () => requestJson<{ telemetryEnabled: boolean; deploymentMode?: DeploymentMode }>(`/api/preferences/appearance?businessId=${encodeURIComponent(businessId!)}`) });
  const partnerSettings = useQuery({ queryKey: partnerSettingsQueryKey(partnerId), enabled: Boolean(projectToken && partnerId) && !sensitive, retry: false, queryFn: () => fetchPartnerSettings(partnerId!) });
  const consent = partnerPage ? partnerSettings.data : preference.data;
  const tenantId = partnerPage ? partnerId : businessId;
  // The server reports the mode it runs with. A build-time value can differ
  // from it, as it did when Railway built the bundle without DEPLOYMENT_MODE.
  const deploymentMode = consent?.deploymentMode ?? "development";
  const permitted = Boolean(projectToken && userId && tenantId && consent?.telemetryEnabled === true && !sensitive);
  // Load the bundled recorder before opting in, so the SDK never fetches it
  // from the PostHog host. Visitors without telemetry never download it.
  const [recorderSettled, setRecorderSettled] = useState(false);
  useEffect(() => {
    if (!permitted || recorderSettled) return;
    let active = true;
    const settle = () => { if (active) setRecorderSettled(true); };
    import("@/lib/session-recorder").then(settle, settle);
    return () => { active = false; };
  }, [permitted, recorderSettled]);
  const allowed = permitted && recorderSettled;
  const telemetryRef = useRef<BrowserTelemetry | null>(null);
  const allowedRef = useRef(false);
  allowedRef.current = allowed;
  // The SDK initializes opted out, so no event is collected before the tenant
  // and route checks below grant consent.
  if (!telemetryRef.current) telemetryRef.current = createBrowserTelemetry(hostPage ? posthog : undefined, { optedOut: true });

  useEffect(() => {
    const telemetry = telemetryRef.current;
    if (!telemetry || !hostPage) return;
    if (!allowed) {
      // Drop an operator identity carried in from the previous page before
      // opting out, so a sensitive route cannot be attributed to the operator.
      // An anonymous id, such as one carried over from lobbystack.com, stays
      // through signup so identify() can merge the landing visit.
      if (sensitive && posthog.get_property("$user_state") === "identified") telemetry.reset();
      telemetry.setOptOut(true);
      telemetry.setSensitiveRoute(sensitive);
      if (!sensitive && tenantId && consent?.telemetryEnabled === false) {
        consumeAuthSuccess();
        if (partnerId) {
          consumePendingPartnerSignup(partnerId);
        } else if (businessId) {
          consumePendingOnboardingBusiness(businessId);
          consumePendingWorkspaceSwitch(businessId);
        }
      }
      return;
    }
    telemetry.setDeploymentMode(deploymentMode);
    // Granting consent captures the current page as a pageview; later
    // navigations are captured by capture_pageview: history_change.
    telemetry.setOptOut(false);
    telemetry.setSensitiveRoute(false);
    const distinctId = `user:${userId}`;
    if (partnerId) {
      // The person stays one PostHog person on the console. Its events belong
      // to the partner, never to a business the person had open before, whose
      // own setting may say no.
      posthog.identify(distinctId);
      posthog.unregister("businessId");
      if (Object.keys(posthog.getGroups()).length > 0) posthog.resetGroups();
      posthog.register({ partnerId });
      const authEvent = consumeAuthSuccess();
      if (authEvent) telemetry.track(authEvent.event, { partnerId, pathname: pathname ?? "/", method: authEvent.method, ...(authEvent.source ? { source: authEvent.source } : {}) });
      const signup = consumePendingPartnerSignup(partnerId);
      if (signup) telemetry.track("web.partner.signup_succeeded", signup);
      return;
    }
    const businessGroup = `business:${businessId}`;
    // An operator remains one person while moving between workspaces. The group
    // is updated for the active workspace and the identifier is registered as an
    // event property so historical attribution cannot depend on browser state.
    posthog.identify(distinctId);
    posthog.unregister("partnerId");
    posthog.register({ businessId });
    posthog.group("business", businessGroup);
    const authEvent = consumeAuthSuccess();
    if (authEvent) telemetry.track(authEvent.event, { businessId, pathname: pathname ?? "/", method: authEvent.method, ...(authEvent.source ? { source: authEvent.source } : {}), $groups: { business: businessGroup } });
    const pendingOnboardingBusinessId = consumePendingOnboardingBusiness(businessId);
    if (pendingOnboardingBusinessId === businessId) {
      telemetry.track("web.onboarding.business_name_submitted", {
        businessId,
        $groups: { business: businessGroup },
      });
    }
    const pendingWorkspaceSwitch = consumePendingWorkspaceSwitch(businessId);
    if (pendingWorkspaceSwitch) {
      telemetry.track("web.workspace.business_switched", {
        businessId,
        previousBusinessId: pendingWorkspaceSwitch.previousBusinessId,
        $groups: { business: businessGroup },
      });
    }
  }, [allowed, businessId, consent?.telemetryEnabled, deploymentMode, hostPage, partnerId, pathname, sensitive, tenantId, userId]);
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
