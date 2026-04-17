import { useConvex } from "convex/react";
import {
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
  getFunctionName,
} from "convex/server";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

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
const inFlightRequests = new Map<
  string,
  {
    id: number;
    promise: Promise<unknown>;
  }
>();
const cacheListeners = new Set<() => void>();
let nextRequestId = 0;
let cacheVersion = 0;

function notifyCacheListeners(): void {
  cacheVersion += 1;
  for (const listener of cacheListeners) {
    listener();
  }
}

function subscribeToCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
}

function getCacheVersion(): number {
  return cacheVersion;
}

export function clearCachedConvexQueries(): void {
  queryCache.clear();
  inFlightRequests.clear();
  notifyCacheListeners();
}

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
  options?: { force?: boolean },
): Promise<FunctionReturnType<Query>> {
  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest && !options?.force) {
    return existingRequest.promise as Promise<FunctionReturnType<Query>>;
  }

  const requestId = ++nextRequestId;
  const request = fetcher()
    .then((result) => {
      const currentRequest = inFlightRequests.get(cacheKey);
      if (currentRequest?.id === requestId) {
        queryCache.set(cacheKey, {
          data: result,
          updatedAt: Date.now(),
        });
        notifyCacheListeners();
      }
      return result;
    })
    .finally(() => {
      const currentRequest = inFlightRequests.get(cacheKey);
      if (currentRequest?.id === requestId) {
        inFlightRequests.delete(cacheKey);
      }
    });

  inFlightRequests.set(cacheKey, {
    id: requestId,
    promise: request,
  });
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
  notifyCacheListeners();
}

export function invalidateCachedConvexQuery<Query extends CachedQueryReference>(
  query: Query,
  args: FunctionArgs<Query>,
): void {
  queryCache.delete(buildCacheKey(query, args));
  notifyCacheListeners();
}

export function useCachedConvexQuery<Query extends CachedQueryReference>(
  query: Query,
  args: FunctionArgs<Query>,
  options?: UseCachedConvexQueryOptions,
): UseCachedConvexQueryResult<FunctionReturnType<Query>> {
  const convex = useConvex();
  const staleTimeMs = options?.staleTimeMs ?? DEFAULT_STALE_TIME_MS;
  const mountedRef = useRef(true);
  const latestRunFetchIdRef = useRef(0);
  const serializedArgs = JSON.stringify(args);
  const stableArgs = useMemo(() => args, [serializedArgs]);
  const observedCacheVersion = useSyncExternalStore(subscribeToCache, getCacheVersion);
  const cacheKey = useMemo(() => buildCacheKey(query, stableArgs), [query, serializedArgs]);
  const cacheEntry = useMemo(
    () => readCacheEntry(query, stableArgs),
    [observedCacheVersion, query, serializedArgs],
  );

  const [state, setState] = useState<{
    cacheKey: string;
    data: FunctionReturnType<Query> | undefined;
    isLoading: boolean;
    error: Error | null;
    updatedAt: number | null;
  }>({
    cacheKey,
    data: cacheEntry?.data,
    isLoading: cacheEntry === undefined,
    error: null,
    updatedAt: cacheEntry?.updatedAt ?? null,
  });

  const visibleState =
    state.cacheKey === cacheKey
      ? cacheEntry &&
        (state.updatedAt === null ||
          cacheEntry.updatedAt !== state.updatedAt ||
          cacheEntry.data !== state.data)
        ? {
            cacheKey,
            data: cacheEntry.data,
            error: null,
            isLoading: false,
            updatedAt: cacheEntry.updatedAt,
          }
        : state
      : {
          cacheKey,
          data: cacheEntry?.data,
          isLoading: cacheEntry === undefined,
          error: null,
          updatedAt: cacheEntry?.updatedAt ?? null,
        };

  const runFetch = useCallback(
    async (force: boolean): Promise<FunctionReturnType<Query>> => {
      const cachedEntry = readCacheEntry(query, stableArgs);
      const runFetchId = ++latestRunFetchIdRef.current;

      if (!force && cachedEntry && isFresh(cachedEntry.updatedAt, staleTimeMs)) {
        if (mountedRef.current && latestRunFetchIdRef.current === runFetchId) {
          setState({
            cacheKey,
            data: cachedEntry.data,
            error: null,
            isLoading: false,
            updatedAt: cachedEntry.updatedAt,
          });
        }
        return cachedEntry.data;
      }

      if (mountedRef.current && latestRunFetchIdRef.current === runFetchId) {
        setState({
          cacheKey,
          data: cachedEntry?.data,
          error: null,
          isLoading: cachedEntry === undefined,
          updatedAt: cachedEntry?.updatedAt ?? null,
        });
      }

      try {
        const result = await fetchAndCache<Query>(cacheKey, () =>
          convex.query(query, stableArgs),
          { force },
        );
        if (mountedRef.current && latestRunFetchIdRef.current === runFetchId) {
          setState({
            cacheKey,
            data: result,
            error: null,
            isLoading: false,
            updatedAt: Date.now(),
          });
        }
        return result;
      } catch (fetchError) {
        if (mountedRef.current && latestRunFetchIdRef.current === runFetchId) {
          setState({
            cacheKey,
            data: cachedEntry?.data,
            error:
              fetchError instanceof Error ? fetchError : new Error("Failed to load data."),
            isLoading: false,
            updatedAt: cachedEntry?.updatedAt ?? null,
          });
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

  if (visibleState.error && visibleState.data === undefined) {
    throw visibleState.error;
  }

  return {
    data: visibleState.data,
    isLoading: visibleState.isLoading,
    refresh,
  };
}
