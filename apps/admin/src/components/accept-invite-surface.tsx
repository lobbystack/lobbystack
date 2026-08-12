"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

async function accept(token: string): Promise<{ businessId: string; role: string }> {
  const response = await fetch("/api/team/accept", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Unable to accept invitation.");
  return await response.json() as { businessId: string; role: string };
}

export function AcceptInviteSurface() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "working" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token");
    setToken(value);
    if (!value) setError("This invitation link is missing its token.");
  }, []);

  async function submit() {
    if (!token) return;
    setState("working");
    setError(null);
    try {
      await accept(token);
      setState("success");
      router.push("/");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "Unable to accept invitation.");
    }
  }

  return <PageSurface title="Accept invitation" description="Join the workspace using this secure invitation link."><Card className="max-w-xl"><CardHeader><CardTitle>{state === "success" ? "Invitation accepted" : "Ready to join?"}</CardTitle><CardDescription>{error ?? "Sign in with the account that should receive workspace access, then accept the invitation."}</CardDescription></CardHeader><CardContent><Button onClick={() => void submit()} disabled={!token || state === "working"}>{state === "working" ? "Joining..." : "Accept invitation"}</Button></CardContent></Card></PageSurface>;
}
