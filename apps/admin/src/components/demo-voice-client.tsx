"use client";

import { useCallback } from "react";
import { AuraVoiceDemo } from "./web-voice/AuraVoiceDemo";

export function DemoVoiceClient({ businessSlug, token }: { businessSlug: string; token: string }) {
  const getStartPayload = useCallback(async () => ({ prospectDemoToken: token }), [token]);
  return <AuraVoiceDemo auraTone="light" businessSlug={businessSlug} className="w-full" getStartPayload={getStartPayload} widgetId="lobbystack-prospect-demo" />;
}
