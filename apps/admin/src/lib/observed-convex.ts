import { useCallback, useMemo } from "react";

import { captureAnalyticsException } from "@/lib/analytics";
import {
  isExpectedConvexFailure,
  type TelemetryProperties,
} from "@lobbystack/telemetry";
import { getFunctionName } from "@/lib/convex-compat/api";
import type { FunctionReference } from "@/lib/convex-compat/server";
import { useAction, useMutation } from "@/lib/convex-compat/react";

type ObservedConvexOptions = {
  operation?: string;
  alertable?: boolean;
  expected?: boolean;
  reportFailures?: boolean;
  properties?: TelemetryProperties;
};

function buildSanitizedConvexError(referenceName: string, type: "action" | "mutation"): Error {
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
  if (options?.reportFailures === false) {
    return;
  }
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

export function useObservedMutation<Mutation extends FunctionReference<"mutation">>(
  reference: Mutation,
  options?: ObservedConvexOptions,
): (args: Record<string, unknown>) => Promise<any> {
  const mutate = useMutation(reference);
  const referenceName = getFunctionName(reference);

  return useCallback(
    async (args: Record<string, unknown>) => {
      try {
        return await mutate(args);
      } catch (error) {
        captureRejectedConvexCall(error, referenceName, "mutation", options);
        throw error;
      }
    },
    [mutate, options, referenceName],
  );
}

export function useObservedAction<Action extends FunctionReference<"action">>(
  reference: Action,
  options?: ObservedConvexOptions,
): (args: Record<string, unknown>) => Promise<any> {
  const action = useAction(reference);
  const referenceName = getFunctionName(reference);

  return useCallback(
    async (args: Record<string, unknown>) => {
      try {
        return await action(args);
      } catch (error) {
        captureRejectedConvexCall(error, referenceName, "action", options);
        throw error;
      }
    },
    [action, options, referenceName],
  );
}
