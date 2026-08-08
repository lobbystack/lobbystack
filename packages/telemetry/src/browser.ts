import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForOperator,
  redactAiTraceProperties,
  redactSensitiveUrlValue,
  redactTelemetryProperties,
  WEB_EVENT_NAMES,
  type TelemetryEventName,
  type TelemetryProperties,
} from "./index";

export {
  WEB_EVENT_NAMES,
  redactAiTraceProperties,
  redactSensitiveUrlValue,
  redactTelemetryProperties,
};

export type BusinessTelemetryOptOutChecker = {
  isBusinessOptedOut(businessId: string): boolean | Promise<boolean>;
};

export type BrowserProductAnalyticsClient = {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string, properties?: Record<string, unknown>): void;
  group(
    groupType: string,
    groupKey: string,
    properties?: Record<string, unknown>,
  ): void;
  reset(): void;
};

export type IdentifyOperatorInput = {
  userId: string;
  businessId?: string;
  deploymentMode: string;
};

let analyticsClient: BrowserProductAnalyticsClient | null = null;
let optOutChecker: BusinessTelemetryOptOutChecker | null = null;
let identifiedUserId: string | null = null;
let identifiedBusinessId: string | null = null;

export function configureBrowserTelemetry(config: {
  client: BrowserProductAnalyticsClient;
  optOutChecker?: BusinessTelemetryOptOutChecker;
}): void {
  analyticsClient = config.client;
  optOutChecker = config.optOutChecker ?? null;
}

export function captureEvent(
  name: TelemetryEventName,
  properties: TelemetryProperties = {},
): void {
  if (!analyticsClient) {
    return;
  }

  const businessId =
    typeof properties.businessId === "string" ? properties.businessId : undefined;
  if (businessId && optOutChecker) {
    const optedOut = optOutChecker.isBusinessOptedOut(businessId);
    if (optedOut instanceof Promise) {
      void optedOut.then((isOptedOut) => {
        if (!isOptedOut) {
          analyticsClient?.capture(name, redactTelemetryProperties(properties));
        }
      });
      return;
    }
    if (optedOut) {
      return;
    }
  }

  analyticsClient.capture(name, redactTelemetryProperties(properties));
}

export function identifyOperator(input: IdentifyOperatorInput): void {
  if (!analyticsClient) {
    return;
  }

  const distinctId = getPostHogDistinctIdForOperator(input.userId);
  if (identifiedUserId !== distinctId) {
    analyticsClient.identify(distinctId, {
      deploymentMode: input.deploymentMode,
      userId: input.userId,
    });
    identifiedUserId = distinctId;
  }

  if (input.businessId) {
    const groupKey = getPostHogBusinessGroupKey(input.businessId);
    if (identifiedBusinessId !== groupKey) {
      analyticsClient.group("business", groupKey, {
        businessId: input.businessId,
        deploymentMode: input.deploymentMode,
      });
      identifiedBusinessId = groupKey;
    }
  }
}

export function resetIdentity(): void {
  identifiedUserId = null;
  identifiedBusinessId = null;
  analyticsClient?.reset();
}
