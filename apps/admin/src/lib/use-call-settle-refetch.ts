"use client";

import { useCallback, useEffect, useState } from "react";

import { subscribeTestCallEnded, subscribeTestChatReplied } from "@/lib/test-window";

/** The call ends in the browser before the worker finishes writing it down. */
export const CALL_SETTLE_POLL_MS = 2_000;
export const CALL_SETTLE_WINDOW_MS = 60_000;

/**
 * A refetch interval for anything that changes once a test is recorded. It
 * polls briefly after a call ends or a test chat gets a reply in this tab, long
 * enough for the server's write to land, then stops.
 */
export function useCallSettleRefetch(): () => number | false {
  const [awaitingCallSince, setAwaitingCallSince] = useState<number | null>(null);
  useEffect(() => {
    const settle = () => setAwaitingCallSince(Date.now());
    const stopCalls = subscribeTestCallEnded(settle);
    const stopChats = subscribeTestChatReplied(settle);
    return () => { stopCalls(); stopChats(); };
  }, []);
  return useCallback(
    () => awaitingCallSince !== null && Date.now() - awaitingCallSince < CALL_SETTLE_WINDOW_MS ? CALL_SETTLE_POLL_MS : false,
    [awaitingCallSince],
  );
}
