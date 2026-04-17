import { useEffect, useRef } from "react";
import { useConvexAuth } from "convex/react";

import { clearCachedConvexQueries } from "@/lib/cached-convex-query";
import { clearRememberedConvexQueries } from "@/lib/remembered-convex-query";

export function clearAuthScopedClientState(): void {
  clearCachedConvexQueries();
  clearRememberedConvexQueries();
}

export function useResetAuthScopedClientStateOnSignOut(): void {
  const auth = useConvexAuth();
  const wasAuthenticatedRef = useRef(auth.isAuthenticated);

  useEffect(() => {
    if (wasAuthenticatedRef.current && !auth.isAuthenticated) {
      clearAuthScopedClientState();
    }

    wasAuthenticatedRef.current = auth.isAuthenticated;
  }, [auth.isAuthenticated]);
}
