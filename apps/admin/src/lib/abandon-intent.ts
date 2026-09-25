/**
 * Decides when to ask an operator who has not yet heard their agent why they
 * are leaving. The answer is only worth having once, so the prompt is capped
 * per browser, and it must never compete with onboarding or with the upgrade
 * prompt that follows a finished test call.
 */

export const ABANDON_INTENT_STORAGE_KEY = "lobbystack.activation.abandonPrompted";

/** A month between asks. Anyone still stuck will be back before then. */
export const ABANDON_INTENT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1_000;

/** Long enough that the page has rendered and been looked at. */
export const ABANDON_INTENT_MIN_DWELL_MS = 20_000;

/** A dashboard open this long with nothing heard is its own signal. */
export const ABANDON_INTENT_IDLE_MS = 3 * 60 * 1_000;

/** A finished call hands the moment to the upgrade prompt. */
export const ABANDON_INTENT_CALL_GRACE_MS = 60_000;

export type AbandonIntentTrigger = "exit_intent" | "idle_without_test_call";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function readPromptedAt(businessId: string, storage: Storage | undefined): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ABANDON_INTENT_STORAGE_KEY);
    if (!raw) return null;
    const value = (JSON.parse(raw) as Record<string, number>)[businessId];
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

export function markAbandonIntentPrompted(businessId: string, now: number, storage: Storage | undefined): void {
  if (!storage) return;
  try {
    const raw = storage.getItem(ABANDON_INTENT_STORAGE_KEY);
    const current = raw ? JSON.parse(raw) as Record<string, number> : {};
    storage.setItem(ABANDON_INTENT_STORAGE_KEY, JSON.stringify({ ...current, [businessId]: now }));
  } catch {
    // Storage is unavailable; the cap is best effort and the prompt still works.
  }
}

/**
 * True while this operator is a candidate: a workspace that has never heard a
 * call, on a pointing device, outside the cooldown.
 */
export function canPromptAbandonIntent(input: {
  businessId: string | undefined;
  completedWebCalls: number | undefined;
  hasFinePointer: boolean;
  now: number;
  storage: Storage | undefined;
}): boolean {
  if (!input.businessId || input.completedWebCalls === undefined) return false;
  if (input.completedWebCalls > 0) return false;
  if (!input.hasFinePointer) return false;
  const promptedAt = readPromptedAt(input.businessId, input.storage);
  return promptedAt === null || input.now - promptedAt >= ABANDON_INTENT_COOLDOWN_MS;
}

/** The pointer left through the top of the viewport, rather than to another element. */
export function isExitIntentEvent(event: { clientY: number; relatedTarget: EventTarget | null }): boolean {
  return event.clientY <= 0 && event.relatedTarget === null;
}
