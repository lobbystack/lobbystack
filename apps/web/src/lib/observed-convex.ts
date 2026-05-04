import { useAction, useMutation } from "convex/react";
import { getFunctionName } from "convex/server";
import type { FunctionReference } from "convex/server";
import { useCallback } from "react";

import { captureAnalyticsException } from "@/lib/analytics";
import type { TelemetryProperties } from "@lobbystack/telemetry";

type ObservedConvexOptions = {
  operation?: string;
  alertable?: boolean;
  expected?: boolean;
  properties?: TelemetryProperties;
};
type AnyObservedFunctionReference = FunctionReference<
  "query" | "mutation" | "action",
  "public" | "internal"
>;

function captureRejectedConvexCall(
  error: unknown,
  reference: AnyObservedFunctionReference,
  type: "action" | "mutation",
  options?: ObservedConvexOptions,
): void {
  const referenceName = getFunctionName(reference);
  captureAnalyticsException(error, {
    ...options?.properties,
    operation: options?.operation ?? `convex_${type}:${referenceName}`,
    convexFunctionType: type,
    convexFunction: referenceName,
    alertable: options?.alertable ?? true,
    expected: options?.expected ?? false,
  });
}

export function useObservedAction<
  Reference extends FunctionReference<"action", "public">,
>(
  reference: Reference,
  options?: ObservedConvexOptions,
): ReturnType<typeof useAction<Reference>> {
  const actionFn = useAction(reference);

  return useCallback(
    (async (...args: Parameters<typeof actionFn>) => {
      try {
        return await actionFn(...args);
      } catch (error) {
        captureRejectedConvexCall(error, reference, "action", options);
        throw error;
      }
    }) as ReturnType<typeof useAction<Reference>>,
    [actionFn, options, reference],
  );
}

export function useObservedMutation<
  Reference extends FunctionReference<"mutation", "public">,
>(
  reference: Reference,
  options?: ObservedConvexOptions,
): ReturnType<typeof useMutation<Reference>> {
  const mutationFn = useMutation(reference);

  return useCallback(
    (async (...args: Parameters<typeof mutationFn>) => {
      try {
        return await mutationFn(...args);
      } catch (error) {
        captureRejectedConvexCall(error, reference, "mutation", options);
        throw error;
      }
    }) as ReturnType<typeof useMutation<Reference>>,
    [mutationFn, options, reference],
  );
}

export type { ObservedConvexOptions };
