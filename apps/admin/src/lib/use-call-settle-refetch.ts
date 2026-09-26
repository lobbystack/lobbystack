"use client";

import { useCallback, useEffect, useState } from "react";

import { subscribeTestCallEnded } from "@/lib/test-call-launcher";

/** The call ends in the browser before the gateway finishes writing it down. */
export const CALL_SETTLE_POLL_MS = 2_000;
export const CALL_SETTLE_WINDOW_MS = 60_000;

/**
 * A refetch interval for anything that changes once a test call is recorded.
 * It polls briefly after a call ends in this tab, long enough for the gateway
 * write to land, then stops.
 */
export function useCallSettleRefetch(): () => number | false {
  const [awaitingCallSince, setAwaitingCallSince] = useState<number | null>(null);
  useEffect(() => subscribeTestCallEnded(() => setAwaitingCallSince(Date.now())), []);
  return useCallback(
    () => awaitingCallSince !== null && Date.now() - awaitingCallSince < CALL_SETTLE_WINDOW_MS ? CALL_SETTLE_POLL_MS : false,
    [awaitingCallSince],
  );
}
