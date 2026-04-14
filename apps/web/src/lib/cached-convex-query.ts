import { useConvex } from "convex/react";
import {
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
  getFunctionName,
} from "convex/server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CachedQueryReference = FunctionReference<"query", "public">;

type CacheEntry<TData> = {
  data: TData;
  updatedAt: number;
};

type UseCachedConvexQueryOptions = {
  staleTimeMs?: number;
};

type UseCachedConvexQueryResult<TData> = {
  data: TData | undefined;
  isLoading: boolean;
  refresh: () => Promise<TData>;
};

const DEFAULT_STALE_TIME_MS = 5 * 60 * 1000;
const queryCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

function buildCacheKey<Query extends CachedQueryReference>(
  query: Query,
  args: FunctionArgs<Query>,
): string {
  return `${getFunctionName(query)}:${JSON.stringify(args)}`;
}

function readCacheEntry<Query extends CachedQueryReference>(
  query: Query,
  args: FunctionArgs<Query>,
): CacheEntry<FunctionReturnType<Query>> | undefined {
  return queryCache.get(buildCacheKey(query, args)) as
    | CacheEntry<FunctionReturnType<Query>>
    | undefined;
}

function isFresh(updatedAt: number, staleTimeMs: number): boolean {
  return Date.now() - updatedAt < staleTimeMs;
}

async function fetchAndCache<Query extends CachedQueryReference>(
  cacheKey: string,
  fetcher: () => Promise<FunctionReturnType<Query>>,
): Promise<FunctionReturnType<Query>> {
  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest as Promise<FunctionReturnType<Query>>;
  }

  const request = fetcher()
    .then((result) => {
      queryCache.set(cacheKey, {
        data: result,
        updatedAt: Date.now(),
      });
      return result;
    })
    .finally(() => {
      inFlightRequests.delete(cacheKey);
    });

  inFlightRequests.set(cacheKey, request);
  return request;
}

export function setCachedConvexQuery<Query extends CachedQueryReference>(
  query: Query,
  args: FunctionArgs<Query>,
  data: FunctionReturnType<Query>,
): void {
  queryCache.set(buildCacheKey(query, args), {
    data,
    updatedAt: Date.now(),
  });
}

export function invalidateCachedConvexQuery<Query extends CachedQueryReference>(
  query: Query,
  args: FunctionArgs<Query>,
): void {
  queryCache.delete(buildCacheKey(query, args));
}

export function useCachedConvexQuery<Query extends CachedQueryReference>(
  query: Query,
  args: FunctionArgs<Query>,
  options?: UseCachedConvexQueryOptions,
): UseCachedConvexQueryResult<FunctionReturnType<Query>> {
  const convex = useConvex();
  const staleTimeMs = options?.staleTimeMs ?? DEFAULT_STALE_TIME_MS;
  const mountedRef = useRef(true);
  const serializedArgs = JSON.stringify(args);
  const stableArgs = useMemo(() => args, [serializedArgs]);
  const cacheKey = useMemo(() => buildCacheKey(query, stableArgs), [query, serializedArgs]);
  const initialEntry = useMemo(
    () => readCacheEntry(query, stableArgs),
    [query, serializedArgs],
  );

  const [data, setData] = useState<FunctionReturnType<Query> | undefined>(
    initialEntry?.data,
  );
  const [isLoading, setIsLoading] = useState(() => initialEntry === undefined);
  const [error, setError] = useState<Error | null>(null);

  const runFetch = useCallback(
    async (force: boolean): Promise<FunctionReturnType<Query>> => {
      const cachedEntry = readCacheEntry(query, stableArgs);

      if (!force && cachedEntry && isFresh(cachedEntry.updatedAt, staleTimeMs)) {
        if (mountedRef.current) {
          setData(cachedEntry.data);
          setError(null);
          setIsLoading(false);
        }
        return cachedEntry.data;
      }

      if (mountedRef.current) {
        if (cachedEntry) {
          setData(cachedEntry.data);
          setIsLoading(false);
        } else {
          setIsLoading(true);
        }
        setError(null);
      }

      try {
        const result = await fetchAndCache<Query>(cacheKey, () =>
          convex.query(query, stableArgs),
        );
        if (mountedRef.current) {
          setData(result);
          setError(null);
          setIsLoading(false);
        }
        return result;
      } catch (fetchError) {
        if (mountedRef.current) {
          setError(
            fetchError instanceof Error ? fetchError : new Error("Failed to load data."),
          );
          setIsLoading(false);
        }
        throw fetchError;
      }
    },
    [cacheKey, convex, query, stableArgs, staleTimeMs],
  );

  useEffect(() => {
    mountedRef.current = true;
    void runFetch(false);

    return () => {
      mountedRef.current = false;
    };
  }, [runFetch]);

  const refresh = useCallback(async () => {
    invalidateCachedConvexQuery(query, stableArgs);
    return await runFetch(true);
  }, [query, runFetch, stableArgs]);

  if (error && data === undefined) {
    throw error;
  }

  return { data, isLoading, refresh };
}
