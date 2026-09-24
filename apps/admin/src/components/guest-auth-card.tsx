"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthCard } from "./auth-card";
import { getSafeReturnTo } from "@/lib/auth-return-to";
import { stripLocalePrefix } from "@/lib/locale-path";

export function GuestAuthCard({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const [checking, setChecking] = useState(true);
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
          const returnTo = getSafeReturnTo(new URLSearchParams(window.location.search).get("returnTo")) ?? "/";
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
  return <AuthCard mode={mode} />;
}
