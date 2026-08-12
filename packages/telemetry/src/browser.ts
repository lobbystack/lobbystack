import type { TelemetryEventName, TelemetryProperties } from "./index.js";
import { redactTelemetryProperties } from "./index.js";

export type BrowserAnalyticsClient = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify?: (distinctId: string, properties?: Record<string, unknown>) => void;
  reset?: () => void;
  opt_out_capturing?: () => void;
  opt_in_capturing?: () => void;
  startSessionRecording?: () => void;
  stopSessionRecording?: () => void;
};

export type BrowserTelemetry = {
  track: (event: TelemetryEventName, properties?: TelemetryProperties) => void;
  identify: (distinctId: string, properties?: TelemetryProperties) => void;
  reset: () => void;
  setOptOut: (optedOut: boolean) => void;
  setSensitiveRoute: (sensitive: boolean) => void;
};

export function createBrowserTelemetry(
  client: BrowserAnalyticsClient | undefined,
): BrowserTelemetry {
  let optedOut = false;
  let sensitiveRoute = false;

  return {
    track(event, properties = {}) {
      if (!client || optedOut || sensitiveRoute) {
        return;
      }
      client.capture(event, redactTelemetryProperties(properties) as Record<string, unknown>);
    },
    identify(distinctId, properties = {}) {
      if (!client || optedOut) {
        return;
      }
      client.identify?.(distinctId, redactTelemetryProperties(properties) as Record<string, unknown>);
    },
    reset() {
      client?.reset?.();
    },
    setOptOut(nextOptedOut) {
      optedOut = nextOptedOut;
      if (nextOptedOut) {
        client?.opt_out_capturing?.();
        client?.stopSessionRecording?.();
      } else {
        client?.opt_in_capturing?.();
      }
    },
    setSensitiveRoute(sensitive) {
      sensitiveRoute = sensitive;
      if (sensitive) {
        client?.stopSessionRecording?.();
      } else if (!optedOut) {
        client?.startSessionRecording?.();
      }
    },
  };
}
