import { useAction, useMutation, type ReactMutation } from "convex/react";
import { getFunctionName } from "convex/server";
import type { FunctionReference } from "convex/server";
import { useCallback, useMemo } from "react";

import { captureAnalyticsException } from "@/lib/analytics";
import {
  isExpectedConvexFailure,
  type TelemetryProperties,
} from "@lobbystack/telemetry";

type ObservedConvexOptions = {
  operation?: string;
  alertable?: boolean;
  expected?: boolean;
  reportFailures?: boolean;
  properties?: TelemetryProperties;
};

function buildSanitizedConvexError(
  referenceName: string,
  type: "action" | "mutation",
): Error {
  const error = new Error(`Convex ${type} ${referenceName} failed.`);
  error.name = type === "action" ? "ConvexActionError" : "ConvexMutationError";
  return error;
}

function captureRejectedConvexCall(
  error: unknown,
  referenceName: string,
  type: "action" | "mutation",
  options?: ObservedConvexOptions,
): void {
  const expected = options?.expected ?? isExpectedConvexFailure(error);
  captureAnalyticsException(buildSanitizedConvexError(referenceName, type), {
    ...options?.properties,
    operation: options?.operation ?? `convex_${type}:${referenceName}`,
    convexFunctionType: type,
    convexFunction: referenceName,
    alertable: options?.alertable ?? !expected,
    expected,
  });
}

function buildCaptureOptions(input: {
  operation?: string | undefined;
  alertable?: boolean | undefined;
  expected?: boolean | undefined;
  properties?: TelemetryProperties | undefined;
}): ObservedConvexOptions | undefined {
  const options: ObservedConvexOptions = {};
  if (input.operation !== undefined) {
    options.operation = input.operation;
  }
  if (input.alertable !== undefined) {
    options.alertable = input.alertable;
  }
  if (input.expected !== undefined) {
    options.expected = input.expected;
  }
  if (input.properties !== undefined) {
    options.properties = input.properties;
  }
  return Object.keys(options).length > 0 ? options : undefined;
}

function buildObservedMutation<
  Reference extends FunctionReference<"mutation", "public">,
>(
  mutationFn: ReactMutation<Reference>,
  referenceName: string,
  options?: ObservedConvexOptions,
): ReactMutation<Reference> {
  const observedMutation = (async (...args: Parameters<ReactMutation<Reference>>) => {
    try {
      return await mutationFn(...args);
    } catch (error) {
      if (options?.reportFailures !== false) {
        captureRejectedConvexCall(error, referenceName, "mutation", options);
      }
      throw error;
    }
  }) as ReactMutation<Reference>;

  observedMutation.withOptimisticUpdate = ((optimisticUpdate) =>
    buildObservedMutation(
      mutationFn.withOptimisticUpdate(optimisticUpdate),
      referenceName,
      options,
    )) as ReactMutation<Reference>["withOptimisticUpdate"];

  return observedMutation;
}

export function useObservedAction<
  Reference extends FunctionReference<"action", "public">,
>(
  reference: Reference,
  options?: ObservedConvexOptions,
): ReturnType<typeof useAction<Reference>> {
  const actionFn = useAction(reference);
  const referenceName = getFunctionName(reference);
  const operation = options?.operation;
  const alertable = options?.alertable;
  const expected = options?.expected;
  const properties = options?.properties;
  const reportFailures = options?.reportFailures;

  return useCallback(
    (async (...args: Parameters<typeof actionFn>) => {
      try {
        return await actionFn(...args);
      } catch (error) {
        if (reportFailures !== false) {
          captureRejectedConvexCall(
            error,
            referenceName,
            "action",
            buildCaptureOptions({ operation, alertable, expected, properties }),
          );
        }
        throw error;
      }
    }) as ReturnType<typeof useAction<Reference>>,
    [actionFn, alertable, expected, operation, properties, referenceName, reportFailures],
  );
}

export function useObservedMutation<
  Reference extends FunctionReference<"mutation", "public">,
>(
  reference: Reference,
  options?: ObservedConvexOptions,
): ReturnType<typeof useMutation<Reference>> {
  const mutationFn = useMutation(reference);
  const referenceName = getFunctionName(reference);
  const operation = options?.operation;
  const alertable = options?.alertable;
  const expected = options?.expected;
  const properties = options?.properties;
  const reportFailures = options?.reportFailures;

  const captureOptions = useMemo((): ObservedConvexOptions | undefined => {
    const next = buildCaptureOptions({ operation, alertable, expected, properties }) ?? {};
    if (reportFailures !== undefined) {
      next.reportFailures = reportFailures;
    }
    return Object.keys(next).length > 0 ? next : undefined;
  }, [alertable, expected, operation, properties, reportFailures]);

  return useMemo(
    () => buildObservedMutation(mutationFn, referenceName, captureOptions),
    [captureOptions, mutationFn, referenceName],
  );
}

export type { ObservedConvexOptions };
