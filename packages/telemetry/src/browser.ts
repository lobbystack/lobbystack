import type { TelemetryEventName, TelemetryProperties } from "./index.js";
import { redactTelemetryProperties } from "./index.js";

export type BrowserAnalyticsClient = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify?: (distinctId: string, properties?: Record<string, unknown>) => void;
  reset?: () => void;
  opt_out_capturing?: () => void;
  opt_in_capturing?: (options?: { captureEventName?: false }) => void;
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

/** State the client already has before any setter runs. */
export type BrowserTelemetryState = {
  optedOut?: boolean;
  sensitiveRoute?: boolean;
};

export function createBrowserTelemetry(
  client: BrowserAnalyticsClient | undefined,
  state: BrowserTelemetryState = {},
): BrowserTelemetry {
  let optedOut = state.optedOut ?? false;
  let sensitiveRoute = state.sensitiveRoute ?? false;

  function startSessionRecording() {
    if (!client || optedOut || sensitiveRoute) {
      return;
    }
    client.startSessionRecording?.();
  }

  return {
    track(event, properties = {}) {
      if (!client || optedOut || sensitiveRoute) {
        return;
      }
      client.capture(event, redactTelemetryProperties(properties) as Record<string, unknown>);
    },
    identify(distinctId, properties = {}) {
      if (!client || optedOut || sensitiveRoute) {
        return;
      }
      client.identify?.(distinctId, redactTelemetryProperties(properties) as Record<string, unknown>);
    },
    reset() {
      client?.reset?.();
    },
    setOptOut(nextOptedOut) {
      if (optedOut === nextOptedOut) {
        return;
      }
      optedOut = nextOptedOut;
      if (nextOptedOut) {
        client?.stopSessionRecording?.();
        client?.opt_out_capturing?.();
      } else {
        // Granting consent also captures the current page as a pageview, so no
        // explicit pageview is needed here.
        client?.opt_in_capturing?.({ captureEventName: false });
        startSessionRecording();
      }
    },
    setSensitiveRoute(sensitive) {
      if (sensitiveRoute === sensitive) {
        return;
      }
      sensitiveRoute = sensitive;
      if (sensitive) {
        client?.stopSessionRecording?.();
      } else {
        startSessionRecording();
      }
    },
  };
}
