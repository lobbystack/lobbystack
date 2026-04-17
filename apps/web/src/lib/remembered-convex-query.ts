import { useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import {
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
  getFunctionName,
} from "convex/server";

type RememberedQueryReference = FunctionReference<"query", "public">;

type UseRememberedConvexQueryResult<TData> = {
  data: TData | undefined;
  isInitialLoading: boolean;
  isRefreshing: boolean;
};

const rememberedQueryData = new Map<string, unknown>();

export function clearRememberedConvexQueries(): void {
  rememberedQueryData.clear();
}

function buildRememberedQueryKey<Query extends RememberedQueryReference>(
  query: Query,
  args: FunctionArgs<Query>,
): string {
  return `${getFunctionName(query)}:${JSON.stringify(args)}`;
}

export function useRememberedConvexQuery<Query extends RememberedQueryReference>(
  query: Query,
  args: FunctionArgs<Query> | "skip",
): UseRememberedConvexQueryResult<FunctionReturnType<Query>> {
  const liveData = useQuery(query, args as FunctionArgs<Query> | "skip");
  const serializedArgs = args === "skip" ? null : JSON.stringify(args);
  const cacheKey = useMemo(
    () =>
      args === "skip" || serializedArgs === null
        ? null
        : buildRememberedQueryKey(query, args),
    [args, query, serializedArgs],
  );
  const rememberedData = useMemo(
    () =>
      cacheKey === null
        ? undefined
        : (rememberedQueryData.get(cacheKey) as FunctionReturnType<Query> | undefined),
    [cacheKey],
  );

  useEffect(() => {
    if (cacheKey === null || liveData === undefined) {
      return;
    }

    rememberedQueryData.set(cacheKey, liveData);
  }, [cacheKey, liveData]);

  const data = liveData !== undefined ? liveData : rememberedData;
  const isInitialLoading = args !== "skip" && liveData === undefined && rememberedData === undefined;
  const isRefreshing = args !== "skip" && liveData === undefined && rememberedData !== undefined;

  return {
    data,
    isInitialLoading,
    isRefreshing,
  };
}
