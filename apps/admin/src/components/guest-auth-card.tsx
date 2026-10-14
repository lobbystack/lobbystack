"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthCard } from "./auth-card";
import { getSafeReturnTo } from "@/lib/auth-return-to";
import { recordAuthSuccess } from "@/lib/auth-success-analytics";
import { stripLocalePrefix } from "@/lib/locale-path";
import { rememberPlanFromUrl } from "@/lib/remembered-plan";

export function GuestAuthCard({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const [checking, setChecking] = useState(true);
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    let active = true;
    // Offer Google only when this server has the OAuth client for it.
    fetch("/api/auth/providers")
      .then(async (response) => (await response.json() as { google?: unknown } | null)?.google === true)
      .then((enabled) => { if (active) setGoogle(enabled); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => { if (mode === "signup") rememberPlanFromUrl(window.location.search); }, [mode]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    void (async () => {
      try {
        const response = await fetch("/api/auth/get-session", { credentials: "include", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Session check failed.");
        const session = await response.json() as { user?: { id?: string }; session?: { id?: string } } | null;
        if (!active) return;
        if (session?.user?.id && session.session?.id) {
          const params = new URLSearchParams(window.location.search);
          // AuthCard's Google callback URLs add this marker; router.replace below drops it from history, so it counts once.
          const googleEvent = params.get("google");
          if (googleEvent === "login" || googleEvent === "signup") recordAuthSuccess(`web.auth.${googleEvent}_succeeded`, { method: "google", ...(params.get("source") === "calculator" ? { source: "calculator" } : {}) });
          const returnTo = getSafeReturnTo(params.get("returnTo")) ?? "/";
          const path = stripLocalePrefix(new URL(returnTo, window.location.origin).pathname).replace(/\/$/, "");
          router.replace(path === "/login" || path === "/signup" ? "/" : returnTo);
          return;
        }
      } catch {
        // A failed session lookup must not prevent signing in.
      } finally {
        clearTimeout(timeout);
      }
      if (active) setChecking(false);
    })();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [router]);

  if (checking) return <div className="flex min-h-svh items-center justify-center" role="status"><LoaderCircle className="size-5 animate-spin" aria-hidden="true" /><span className="sr-only">{t("checkingSession")}</span></div>;
  return <AuthCard google={google} mode={mode} />;
}
