"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";

import { secureDemoRedirect } from "@/lib/demo-token";
import { resolveLocale } from "@/lib/locale";

export function DemoTokenCompatibilityRoute() {
  const params = useParams<{ locale: string; token: string }>();
  const token = typeof params.token === "string" ? params.token : null;
  const locale = resolveLocale(params.locale);

  useEffect(() => {
    if (!token) return;
    window.location.replace(secureDemoRedirect(token, locale));
  }, [locale, token]);

  return <main className="grid min-h-svh place-items-center p-6 text-sm text-muted-foreground">Opening secure demo link...</main>;
}
