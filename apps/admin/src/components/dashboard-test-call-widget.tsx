"use client";

import { useEffect, useState } from "react";
import { Mic, Phone, PhoneOff } from "lucide-react";
import { useWebVoiceCall, type WebVoiceErrorKey } from "@web/components/web-voice/useWebVoiceCall";
import { useTranslation } from "react-i18next";

import { Button } from "./ui/button";

const endpoint = process.env.NEXT_PUBLIC_WEB_CALL_ENDPOINT ?? "https://voice.lobbystack.com/web-call/sessions";

export function DashboardTestCallWidget({ businessId, businessSlug }: { businessId: string; businessSlug: string }) {
  const [proofError, setProofError] = useState<string | null>(null);
  const { t } = useTranslation("admin");
  const call = useWebVoiceCall({ businessSlug, endpoint, widgetId: "lobbystack-dashboard-test-call", getStartPayload: async () => {
    const response = await fetch(`/api/voice/test-call/proof?businessId=${encodeURIComponent(businessId)}`, { credentials: "include" });
    if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Test calls are unavailable.");
    setProofError(null);
    const result = await response.json() as { proof: string };
    return { dashboardTestCallProof: result.proof };
  } });

  useEffect(() => {
    if (call.remoteAudioRef.current && call.remoteStream) call.remoteAudioRef.current.srcObject = call.remoteStream;
  }, [call.remoteAudioRef, call.remoteStream]);

  const message = proofError ?? (call.errorKey ? errorMessage(call.errorKey) : null);
  return <div className="flex flex-wrap items-center gap-2"><audio ref={call.remoteAudioRef} autoPlay className="hidden" /><Button aria-label={t("utilities.testCall")} disabled={call.isBusy} onClick={() => { setProofError(null); if (call.isCallActive) void call.forceEndCall(); else void call.startCall(); }} size="sm" variant={call.isCallActive ? "destructive" : "outline"}>{call.isCallActive ? <PhoneOff className="size-4" /> : call.isBusy ? <Mic className="size-4 animate-pulse" /> : <Phone className="size-4" />}{call.isCallActive ? t("utilities.endTestCall") : call.isBusy ? t("utilities.connecting") : t("utilities.testCall")}</Button>{message ? <span className="max-w-64 text-xs text-destructive" role="alert">{message}</span> : null}</div>;
}

function errorMessage(error: WebVoiceErrorKey): string {
  const messages: Record<WebVoiceErrorKey, string> = { microphoneBlocked: "Microphone permission was blocked.", microphoneNotFound: "No microphone was found.", microphoneInUse: "The microphone is already in use.", gatewayTimeout: "The voice gateway timed out.", gatewayUnreachable: "The voice gateway is unavailable.", connectionDropped: "The test call connection dropped.", browserNoMicrophone: "This browser cannot access a microphone.", browserNoWebRtc: "This browser does not support live voice calls.", businessNotFound: "The workspace could not be found.", rateLimited: "Too many test calls. Try again shortly.", unavailable: "The AI receptionist is unavailable.", generic: "The test call could not be started." };
  return messages[error];
}
