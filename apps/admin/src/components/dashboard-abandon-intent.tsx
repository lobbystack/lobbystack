"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { useTelemetry } from "@/components/product-analytics";
import { subscribeTestCallEnded } from "@/lib/test-call-launcher";
import {
  ABANDON_INTENT_CALL_GRACE_MS,
  ABANDON_INTENT_IDLE_MS,
  ABANDON_INTENT_MIN_DWELL_MS,
  canPromptAbandonIntent,
  isExitIntentEvent,
  markAbandonIntentPrompted,
  type AbandonIntentTrigger,
} from "@/lib/abandon-intent";

type Activation = { completedWebCalls: number };

async function getActivation(businessId: string): Promise<Activation> {
  const response = await fetch(`/api/activation?businessId=${encodeURIComponent(businessId)}`, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load activation status.");
  return await response.json() as Activation;
}

function browserStorage(): globalThis.Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Renders nothing. It reports the moment an operator who has never heard their
 * agent looks like they are giving up, so a PostHog survey can ask them why.
 */
export function DashboardAbandonIntent({ businessId }: { businessId: string | undefined }) {
  const telemetry = useTelemetry();
  const firedRef = useRef(false);
  const callEndedAtRef = useRef<number | null>(null);

  const activation = useQuery({
    queryKey: ["activation", businessId],
    enabled: Boolean(businessId),
    queryFn: () => getActivation(businessId!),
  });

  const completedWebCalls = activation.data?.completedWebCalls;

  useEffect(() => subscribeTestCallEnded(() => { callEndedAtRef.current = Date.now(); }), []);

  useEffect(() => {
    if (!businessId || completedWebCalls === undefined || completedWebCalls > 0) return;
    const storage = browserStorage();
    const hasFinePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
    if (!canPromptAbandonIntent({ businessId, completedWebCalls, hasFinePointer, now: Date.now(), storage })) return;

    const armedAt = Date.now();
    firedRef.current = false;

    const fire = (trigger: AbandonIntentTrigger) => {
      if (firedRef.current) return;
      const now = Date.now();
      if (now - armedAt < ABANDON_INTENT_MIN_DWELL_MS) return;
      // A call just ended: that moment belongs to the upgrade prompt.
      if (callEndedAtRef.current !== null && now - callEndedAtRef.current < ABANDON_INTENT_CALL_GRACE_MS) return;
      firedRef.current = true;
      markAbandonIntentPrompted(businessId, now, storage);
      telemetry.track("web.activation.abandon_intent", { businessId, trigger });
    };

    const onMouseOut = (event: MouseEvent) => {
      if (isExitIntentEvent(event)) fire("exit_intent");
    };

    document.addEventListener("mouseout", onMouseOut);
    const idleTimer = window.setTimeout(() => fire("idle_without_test_call"), ABANDON_INTENT_IDLE_MS);

    return () => {
      document.removeEventListener("mouseout", onMouseOut);
      window.clearTimeout(idleTimer);
    };
  }, [businessId, completedWebCalls, telemetry]);

  return null;
}
