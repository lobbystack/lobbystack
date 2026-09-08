"use client";

import { useCallback } from "react";
import { webCallEndpoint } from "@/lib/web-call-endpoint";
import { AuraVoiceDemo } from "./web-voice/AuraVoiceDemo";

export function DemoVoiceClient({ businessSlug, token }: { businessSlug: string; token: string }) {
  const getStartPayload = useCallback(async () => ({ prospectDemoToken: token }), [token]);
  return <AuraVoiceDemo auraTone="light" businessSlug={businessSlug} className="w-full" endpoint={webCallEndpoint} getStartPayload={getStartPayload} widgetId="lobbystack-prospect-demo" />;
}
