"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { PhoneOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AuraVoiceOrb,
  useWebVoiceCall,
  type AuraTone,
  type WebVoiceCallEvent,
  type WebVoiceWidgetStatus,
} from "@lobbystack/web-voice";
import type { TelemetryEventName } from "@lobbystack/telemetry";

// The dashboard has no telemetry event for a created session.
const testCallEvents: Record<WebVoiceCallEvent, TelemetryEventName | undefined> = {
  started: "web.voice.test_call_started",
  connected: "web.voice.test_call_connected",
  ended: "web.voice.test_call_ended",
  error: "web.voice.test_call_error",
  session_created: undefined,
};

type AuraVoiceDemoProps = {
  businessSlug: string;
  endpoint?: string;
  widgetId?: string;
  auraTone?: AuraTone;
  className?: string;
  getStartPayload?: () => Promise<Record<string, string>>;
  onEvent?: (
    eventName: TelemetryEventName,
    properties?: Record<string, unknown>,
  ) => void;
  onRegisterControls?: (controls: {
    forceEndCall: () => Promise<void>;
    startCall: () => Promise<void>;
  }) => void;
  onCallEnded?: () => void;
};

function getButtonLabelKey(
  status: WebVoiceWidgetStatus,
  muted: boolean,
): string {
  if (status === "connected") {
    return muted
      ? "testCall.aria.endMuted"
      : "testCall.aria.end";
  }
  if (status === "ending") {
    return "testCall.aria.ending";
  }
  if (status === "requesting_microphone") {
    return "testCall.aria.waitingForMicrophone";
  }
  if (status === "connecting") {
    return "testCall.aria.connecting";
  }
  if (status === "error") {
    return "testCall.aria.retry";
  }
  return "testCall.aria.start";
}

export function AuraVoiceDemo({
  businessSlug,
  endpoint,
  getStartPayload,
  widgetId,
  auraTone = "light",
  className,
  onEvent,
  onRegisterControls,
  onCallEnded,
}: AuraVoiceDemoProps) {
  const { t } = useTranslation("common");
  const call = useWebVoiceCall({
    businessSlug,
    ...(endpoint ? { endpoint } : {}),
    ...(getStartPayload ? { getStartPayload } : {}),
    ...(widgetId ? { widgetId } : {}),
    ...(onEvent
      ? {
          onEvent: (event, properties) => {
            const name = testCallEvents[event];
            if (name) onEvent(name, properties);
          },
        }
      : {}),
  });
  const { status, muted, errorKey, startCall, endCall, forceEndCall, isCallActive } = call;
  const wasCallActiveRef = useRef(false);

  useLayoutEffect(() => {
    onRegisterControls?.({ forceEndCall, startCall });
  }, [forceEndCall, onRegisterControls, startCall]);

  useEffect(() => {
    if (
      wasCallActiveRef.current &&
      (status === "ending" || status === "ended")
    ) {
      onCallEnded?.();
    }
    wasCallActiveRef.current = isCallActive;
  }, [isCallActive, onCallEnded, status]);

  const statusMessage = errorKey
    ? t(`testCall.errors.${errorKey}`)
    : t(`testCall.status.${status}`);

  return (
    <div
      className={cn(
        "mx-auto flex w-full min-w-0 flex-col items-center text-center",
        className,
      )}
    >
      <AuraVoiceOrb
        call={call}
        statusLabel={statusMessage}
        buttonLabel={t(getButtonLabelKey(status, muted))}
        auraTone={auraTone}
      >
        {status === "connecting" ? (
          <div className="absolute inset-x-0 top-1/2 z-20 mt-32 flex items-center justify-center">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled
              className="rounded-full"
            >
              {t("testCall.connecting")}
            </Button>
          </div>
        ) : isCallActive ? (
          <div className="absolute inset-x-0 top-1/2 z-20 mt-32 flex items-center justify-center">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={endCall}
              className="cursor-pointer rounded-full"
            >
              <PhoneOff className="size-4" aria-hidden="true" />
              {t("testCall.hangUp")}
            </Button>
          </div>
        ) : null}
      </AuraVoiceOrb>

      {errorKey ? (
        <p
          className={cn(
            "mt-4 max-w-sm text-sm",
            auraTone === "dark" ? "text-red-300" : "text-destructive",
          )}
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
