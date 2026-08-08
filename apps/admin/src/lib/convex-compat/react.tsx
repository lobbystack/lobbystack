"use client";

import {
  useMutation as useTanstackMutation,
  useQuery as useTanstackQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { captureAnalyticsException } from "@/lib/analytics";
import {
  isExpectedConvexFailure,
  type TelemetryProperties,
} from "@lobbystack/telemetry";

import { getFunctionName, getFunctionPath } from "./api";
import type { FunctionReference, FunctionReturnType } from "./server";

type ConvexQueryReference = FunctionReference<"query">;
type ConvexMutationReference = FunctionReference<"mutation">;
type ConvexActionReference = FunctionReference<"action">;

async function rpcCall<T>(path: string, args: unknown): Promise<T> {
  const response = await fetch("/api/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
    credentials: "include",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `RPC ${path} failed (${response.status})`);
  }

  const payload = (await response.json()) as { result: T };
  return payload.result;
}

export function useConvexAuth(): {
  isLoading: boolean;
  isAuthenticated: boolean;
} {
  const session = useTanstackQuery({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      const response = await fetch("/api/auth/get-session", { credentials: "include" });
      if (!response.ok) {
        return null;
      }
      return response.json();
    },
    staleTime: 30_000,
  });

  return {
    isLoading: session.isLoading,
    isAuthenticated: Boolean(session.data?.user),
  };
}

export function useQuery<Query extends ConvexQueryReference>(
  reference: Query,
  args: Record<string, unknown> | "skip",
): any {
  const path = getFunctionPath(reference);
  const enabled = args !== "skip";
  const queryKey = useMemo(
    () => ["rpc", path, enabled ? JSON.stringify(args) : "skip"],
    [args, enabled, path],
  );

  const query = useTanstackQuery({
    queryKey,
    enabled,
    queryFn: async () => rpcCall<FunctionReturnType<Query>>(path, args),
    staleTime: 5_000,
  });

  return query.data;
}

type ObservedConvexOptions = {
  operation?: string;
  alertable?: boolean;
  expected?: boolean;
  reportFailures?: boolean;
  properties?: TelemetryProperties;
};

function useObservedCallable<Reference extends ConvexMutationReference | ConvexActionReference>(
  reference: Reference,
  type: "mutation" | "action",
  options?: ObservedConvexOptions,
) {
  const queryClient = useQueryClient();
  const path = getFunctionPath(reference);
  const referenceName = getFunctionName(reference);

  const mutation = useTanstackMutation({
    mutationFn: async (args: Record<string, unknown>) =>
      rpcCall<FunctionReturnType<Reference>>(path, args),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rpc"] });
    },
    onError: (error) => {
      if (options?.reportFailures === false) {
        return;
      }
      const expected = options?.expected ?? isExpectedConvexFailure(error);
      captureAnalyticsException(
        error instanceof Error ? error : new Error(String(error)),
        {
          ...options?.properties,
          operation: options?.operation ?? `convex_${type}:${referenceName}`,
          convexFunctionType: type,
          convexFunction: referenceName,
          alertable: options?.alertable ?? !expected,
          expected,
        },
      );
    },
  });

  return useCallback(
    async (args: Record<string, unknown>) => mutation.mutateAsync(args),
    [mutation],
  );
}

export function useMutation<Mutation extends ConvexMutationReference>(
  reference: Mutation,
): (args: Record<string, unknown>) => Promise<FunctionReturnType<Mutation>> {
  const path = getFunctionPath(reference);
  const queryClient = useQueryClient();

  const mutation = useTanstackMutation({
    mutationFn: async (args: Record<string, unknown>) =>
      rpcCall<FunctionReturnType<Mutation>>(path, args),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rpc"] });
    },
  });

  return useCallback(
    async (args: Record<string, unknown>) => mutation.mutateAsync(args),
    [mutation],
  );
}

export function useAction<Action extends ConvexActionReference>(
  reference: Action,
): (args: Record<string, unknown>) => Promise<FunctionReturnType<Action>> {
  const path = getFunctionPath(reference);
  const queryClient = useQueryClient();

  const mutation = useTanstackMutation({
    mutationFn: async (args: Record<string, unknown>) =>
      rpcCall<FunctionReturnType<Action>>(path, args),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rpc"] });
    },
  });

  return useCallback(
    async (args: Record<string, unknown>) => mutation.mutateAsync(args),
    [mutation],
  );
}

export function useConvex() {
  return {
    query: async (reference: { _path?: string } | string, args: Record<string, unknown>) => {
      const path = getFunctionPath(reference);
      const response = await fetch("/api/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, args }),
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`RPC ${path} failed`);
      }
      const payload = (await response.json()) as { result: unknown };
      return payload.result;
    },
  };
}
