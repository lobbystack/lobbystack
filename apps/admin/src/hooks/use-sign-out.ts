"use client";

import posthog from "posthog-js";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { createBrowserTelemetry } from "@lobbystack/telemetry/browser";
import { resolveLocale } from "@/lib/locale";
import { localizePublicPath } from "@/lib/locale-path";

/** Signs the operator out, clears analytics identity, and goes to `next` or the localized login page. */
export function useSignOut() {
  const router = useRouter();
  const { i18n } = useTranslation();
  const signingOut = useRef(false);
  return async function signOut(next?: string) {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      // A failed request still lands on the login page so the operator is never stuck.
      const response = await fetch("/api/auth/sign-out", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
      if (response?.ok) {
        // Remove the prior operator and workspace association before the next
        // person uses this browser session. This is deliberately best-effort.
        try {
          if (posthog.__loaded) {
            const telemetry = createBrowserTelemetry(posthog, { optedOut: false });
            telemetry.reset();
            telemetry.setOptOut(true);
          }
        } catch {
          // Analytics must never block sign-out.
        }
      }
      router.replace(next ?? localizePublicPath("/login", resolveLocale(i18n.resolvedLanguage, i18n.language)));
      router.refresh();
    } finally {
      signingOut.current = false;
    }
  };
}
