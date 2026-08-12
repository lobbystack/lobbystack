"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

declare global {
  interface Window {
    turnstile?: {
      render(
        element: HTMLElement,
        options: {
          sitekey: string;
          callback(token: string): void;
          "expired-callback"(): void;
          "error-callback"(): void;
        },
      ): string;
      reset(widgetId?: string): void;
    };
  }
}

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function AuthCard({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  function renderTurnstile() {
    if (mode !== "signup" || !turnstileSiteKey || !turnstileRef.current || !window.turnstile || widgetIdRef.current) {
      return;
    }
    widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: turnstileSiteKey,
      callback: setTurnstileToken,
      "expired-callback": () => setTurnstileToken(null),
      "error-callback": () => setTurnstileToken(null),
    });
  }

  useEffect(() => () => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (mode === "signup" && turnstileSiteKey && !turnstileToken) {
      setError("Complete the verification challenge before signing up.");
      return;
    }
    setLoading(true);
    try {
      const body = mode === "login"
        ? { email, password }
        : { name, email, password, ...(turnstileToken ? { turnstileToken } : {}) };
      const response = await fetch(`/api/auth/${mode === "login" ? "sign-in/email" : "sign-up/email"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error("The credentials could not be verified.");
      }
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to continue.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    {mode === "signup" && turnstileSiteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" onLoad={renderTurnstile} /> : null}
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-slate-950 text-xl font-semibold text-white">L</span>
          <div>
            <CardTitle className="text-2xl">{mode === "login" ? "Welcome back" : "Create your workspace"}</CardTitle>
            <CardDescription className="mt-2">{mode === "login" ? "Sign in to manage your AI receptionist." : "Set up your LobbyStack workspace in a few minutes."}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            {mode === "signup" ? <label className="block space-y-2 text-sm font-medium text-slate-700">Name<input className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" value={name} onChange={(event) => setName(event.target.value)} required /></label> : null}
            <label className="block space-y-2 text-sm font-medium text-slate-700">Email<input className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label className="block space-y-2 text-sm font-medium text-slate-700">Password<input className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            {mode === "signup" && turnstileSiteKey ? <div ref={turnstileRef} aria-label="Security verification" /> : null}
            {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            <Button className="w-full" disabled={loading} type="submit">{loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === "login" ? <><Link className="font-medium text-slate-900 underline" href="/signup">Create an account</Link> · <Link className="font-medium text-slate-900 underline" href="/forgot-password">Forgot password?</Link></> : <Link className="font-medium text-slate-900 underline" href="/login">Already have an account?</Link>}
          </p>
        </CardContent>
      </Card>
    </main>
  </>;
}
