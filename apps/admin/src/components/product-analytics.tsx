"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import posthog from "posthog-js";
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
  const businesses = useQuery({ queryKey: ["businesses"], enabled: Boolean(apiKey) && !sensitive, retry: false, queryFn: () => requestJson<{ businesses: Array<{ businessId: string; active: boolean }> }>("/api/businesses") });
  const businessId = selectActiveBusiness(businesses.data?.businesses)?.businessId;
  const preference = useQuery({ queryKey: ["appearance-preferences", businessId], enabled: Boolean(apiKey && businessId) && !sensitive, retry: false, queryFn: () => requestJson<{ telemetryEnabled: boolean }>(`/api/preferences/appearance?businessId=${encodeURIComponent(businessId!)}`) });
  const allowed = Boolean(apiKey && businessId && preference.data?.telemetryEnabled === true && !sensitive);
  const allowedRef = useRef(false);
  allowedRef.current = allowed;

  useEffect(() => {
    if (!allowed || !apiKey) {
      if (!sensitive && businessId && preference.data?.telemetryEnabled === false) consumeAuthSuccess();
      if (posthog.__loaded) posthog.opt_out_capturing();
      return;
    }
    if (!posthog.__loaded) posthog.init(apiKey, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      opt_out_capturing_by_default: true,
      save_campaign_params: false,
      save_referrer: false,
      before_send: event => {
        if (!allowedRef.current || !event) return null;
        sanitizeAnalyticsProperties(event.properties);
        return event;
      },
    });
    posthog.opt_in_capturing({ captureEventName: false });
    const authEvent = consumeAuthSuccess();
    if (authEvent) posthog.capture(authEvent, { businessId, $current_url: `${window.location.origin}${pathname}`, $pathname: pathname });
    posthog.capture("$pageview", { path: pathname, businessId, $current_url: `${window.location.origin}${pathname}`, $pathname: pathname });
  }, [allowed, apiKey, businessId, pathname, preference.data?.telemetryEnabled, sensitive]);
  return null;
}
