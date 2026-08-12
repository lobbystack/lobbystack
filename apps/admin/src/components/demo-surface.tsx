"use client";

import { useEffect, useState } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";
import { DemoVoiceClient } from "./demo-voice-client";

type Preview = {
  state: "preparing" | "active" | "claimed" | "revoked" | "expired" | "invalid";
  businessName?: string;
  businessSlug?: string;
  websiteUrl?: string;
  locale?: string;
  suggestedPrompts?: string[];
};

function demoToken(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get("prospect_demo_token");
}

export function DemoSurface() {
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    const value = demoToken();
    setToken(value);
    if (!value) {
      setPreview({ state: "invalid" });
      return;
    }
    void fetch("/api/demo/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: value }) })
      .then(async (response) => response.ok ? await response.json() as Preview : { state: "invalid" as const })
      .then(setPreview)
      .catch(() => setPreview({ state: "invalid" }));
  }, []);

  const active = preview?.state === "active";
  const description = !preview ? "Checking this secure demo link..." : active
    ? `A receptionist has been prepared for ${preview.businessName ?? "this business"}.`
    : preview.state === "preparing" ? "This receptionist is still being prepared. Try again shortly."
      : preview.state === "claimed" ? "This demo has already been claimed."
        : preview.state === "expired" ? "This demo link has expired."
          : "This demo link is invalid or no longer available.";

  return <PageSurface title={active ? `${preview.businessName} receptionist demo` : "LobbyStack demo"} description={description}>
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>{active ? "Try a realistic conversation" : "Demo unavailable"}</CardTitle><CardDescription>{active ? "Use these prompts when the voice demo opens. Demo mode cannot book, transfer, or send messages." : description}</CardDescription></CardHeader>
      <CardContent className="space-y-6">
        {active && preview.suggestedPrompts?.length ? <ul className="space-y-2 text-sm text-muted-foreground">{preview.suggestedPrompts.map((prompt) => <li key={prompt} className="rounded-xl border p-3">&ldquo;{prompt}&rdquo;</li>)}</ul> : null}
        {active && token && preview.businessSlug ? <DemoVoiceClient businessSlug={preview.businessSlug} token={token} /> : null}
        {active && token ? <div className="flex flex-wrap gap-3"><Button onClick={() => { window.location.href = `/claim-demo#${new URLSearchParams({ prospect_demo_token: token })}`; }}>Claim this workspace</Button>{preview.websiteUrl ? <Button variant="outline" onClick={() => window.open(preview.websiteUrl, "_blank", "noopener,noreferrer")}>View business website</Button> : null}</div> : null}
      </CardContent>
    </Card>
  </PageSurface>;
}
