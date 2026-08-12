"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

export function ClaimDemoSurface() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("prospect_demo_token");
    const value = fragmentToken ?? window.sessionStorage.getItem("prospect_demo_token");
    if (fragmentToken) window.sessionStorage.setItem("prospect_demo_token", fragmentToken);
    setToken(value);
    if (!value) setError("This claim link is missing its secure token.");
  }, []);

  async function claim() {
    if (!token) return;
    setWorking(true);
    setError(null);
    const response = await fetch("/api/demo/claim", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    if (response.status === 401) {
      router.push(`/login?returnTo=${encodeURIComponent("/claim-demo")}`);
      return;
    }
    if (!response.ok) {
      setError((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Unable to claim this demo.");
      setWorking(false);
      return;
    }
    window.sessionStorage.removeItem("prospect_demo_token");
    router.push("/");
    router.refresh();
  }

  return <PageSurface title="Claim demo workspace" description="Turn this prepared receptionist into a workspace you own.">
    <Card className="max-w-xl"><CardHeader><CardTitle>Keep this receptionist</CardTitle><CardDescription>{error ?? "Sign in, then claim the workspace. The temporary operator will be removed and you will become its owner."}</CardDescription></CardHeader><CardContent><Button disabled={!token || working} onClick={() => void claim()}>{working ? "Claiming..." : "Claim workspace"}</Button></CardContent></Card>
  </PageSurface>;
}
