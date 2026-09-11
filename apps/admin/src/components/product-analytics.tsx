"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { PostHog } from "posthog-js";
import { selectActiveBusiness } from "@/lib/active-business";
import { consumeAuthSuccess } from "@/lib/auth-success-analytics";
import { requestJson } from "@/lib/request-json";

export function sanitizeAnalyticsUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/^\/(demo|reset-password)\/[^/]+/, "/$1/[token]");
    return url.toString();
  } catch { return ""; }
}

function sanitizeAnalyticsProperties(properties: Record<string, unknown>): void {
  for (const key of Object.keys(properties)) {
    if (!/^\$web_vitals_(LCP|INP|CLS|FCP)_event$/.test(key)) continue;
    const metric = properties[key];
    if (!metric || typeof metric !== "object") { delete properties[key]; continue; }
    // Web-vitals entries/attribution can contain resource URLs and DOM details.
    // Keep only the numeric metric and its non-content correlation fields.
    properties[key] = Object.fromEntries(Object.entries(metric).filter(([name]) =>
      ["id", "name", "value", "delta", "rating", "navigationType", "timestamp", "$session_id", "$window_id"].includes(name),
    ));
  }
  for (const key of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer"]) {
    if (typeof properties[key] === "string") properties[key] = sanitizeAnalyticsUrl(properties[key]);
  }
  for (const key of ["$set", "$set_once"]) {
    const values = properties[key];
    if (values && typeof values === "object" && !Array.isArray(values)) {
      for (const urlKey of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer"]) {
        const record = values as Record<string, unknown>;
        if (typeof record[urlKey] === "string") record[urlKey] = sanitizeAnalyticsUrl(record[urlKey]);
      }
    }
  }
}

export function ProductAnalytics() {
  const pathname = usePathname();
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const sensitive = /^\/(demo|claim-demo|reset-password|confirm-email-change|accept-invite|login|signup|forgot-password)(\/|$)/.test(pathname ?? "");
  const session = useQuery({ queryKey: ["product-analytics-session"], enabled: Boolean(apiKey) && !sensitive, retry: false, staleTime: 0, refetchOnMount: "always", queryFn: () => requestJson<{ user?: { id?: string } } | null>("/api/auth/get-session") });
  // Do not reuse a cached identity after a sign-out or a different user logs in.
  const userId = session.isSuccess && !session.isFetching ? session.data?.user?.id : undefined;
  const businesses = useQuery({ queryKey: ["businesses"], enabled: Boolean(apiKey) && !sensitive, retry: false, queryFn: () => requestJson<{ businesses: Array<{ businessId: string; active: boolean }> }>("/api/businesses") });
  const businessId = selectActiveBusiness(businesses.data?.businesses)?.businessId;
  const preference = useQuery({ queryKey: ["appearance-preferences", businessId], enabled: Boolean(apiKey && businessId) && !sensitive, retry: false, queryFn: () => requestJson<{ telemetryEnabled: boolean }>(`/api/preferences/appearance?businessId=${encodeURIComponent(businessId!)}`) });
  const allowed = Boolean(apiKey && userId && businessId && preference.data?.telemetryEnabled === true && !sensitive);
  const sdkRef = useRef<PostHog | null>(null);
  const allowedRef = useRef(false);
  allowedRef.current = allowed;

  useEffect(() => {
    allowedRef.current = allowed;
    if (!allowed || !apiKey) {
      if (!sensitive && businessId && preference.data?.telemetryEnabled === false) consumeAuthSuccess();
      if (sensitive && sdkRef.current?.__loaded) sdkRef.current.reset();
      sdkRef.current?.opt_out_capturing();
      return;
    }
    let cancelled = false;
    void import("posthog-js").then(({ default: posthog }) => {
      if (cancelled || !allowedRef.current) return;
      sdkRef.current = posthog;
      const beforeSend: NonNullable<Parameters<PostHog["init"]>[1]>["before_send"] = event => {
        if (!allowedRef.current || !event) return null;
        sanitizeAnalyticsProperties(event.properties);
        return event;
      };
      if (!posthog.__loaded) posthog.init(apiKey, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
        defaults: "2026-05-30",
        autocapture: false,
        capture_exceptions: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        opt_out_capturing_by_default: true,
        save_campaign_params: false,
        save_referrer: false,
        capture_performance: { web_vitals: true, network_timing: false, web_vitals_attribution: false },
        before_send: beforeSend,
      });
      else posthog.set_config({ before_send: beforeSend });
      posthog.opt_in_capturing({ captureEventName: false });
      const distinctId = `user:${userId}`;
      const businessGroup = `business:${businessId}`;
      // An operator remains one person while moving between workspaces. The
      // group is updated for the active workspace; each event also carries it
      // explicitly so its historical attribution cannot depend on browser state.
      posthog.identify(distinctId);
      posthog.group("business", businessGroup);
      const eventProperties = {
        businessId,
        $groups: { business: businessGroup },
        $current_url: `${window.location.origin}${pathname}`,
        $pathname: pathname,
      };
      const authEvent = consumeAuthSuccess();
      if (authEvent) posthog.capture(authEvent, eventProperties);
      posthog.capture("$pageview", { path: pathname, ...eventProperties });
    }).catch(() => { /* Optional analytics must never block the application. */ });
    return () => { cancelled = true; allowedRef.current = false; sdkRef.current?.opt_out_capturing(); };
  }, [allowed, apiKey, businessId, pathname, preference.data?.telemetryEnabled, sensitive, userId]);
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
  return null;
}
