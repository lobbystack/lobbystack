import { describe, expect, it } from "vitest";

import {
  ABANDON_INTENT_COOLDOWN_MS,
  ABANDON_INTENT_STORAGE_KEY,
  canPromptAbandonIntent,
  isExitIntentEvent,
  markAbandonIntentPrompted,
} from "./abandon-intent";

function storageWith(value: string | null) {
  const store: Record<string, string> = value === null ? {} : { [ABANDON_INTENT_STORAGE_KEY]: value };
  return {
    store,
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, next: string) => { store[key] = next; },
  };
}

const base = { businessId: "business", completedWebCalls: 0, hasFinePointer: true, now: 1_000_000 };

describe("abandon intent eligibility", () => {
  it("prompts a workspace that has never heard a call", () => {
    expect(canPromptAbandonIntent({ ...base, storage: storageWith(null) })).toBe(true);
  });

  it("stays silent once a call has been heard", () => {
    expect(canPromptAbandonIntent({ ...base, completedWebCalls: 1, storage: storageWith(null) })).toBe(false);
  });

  it("stays silent on a touch device, where exit intent cannot be detected", () => {
    expect(canPromptAbandonIntent({ ...base, hasFinePointer: false, storage: storageWith(null) })).toBe(false);
  });

  it("stays silent while activation is still loading", () => {
    expect(canPromptAbandonIntent({ ...base, completedWebCalls: undefined, storage: storageWith(null) })).toBe(false);
  });

  it("stays silent inside the cooldown and asks again after it", () => {
    const promptedAt = base.now - ABANDON_INTENT_COOLDOWN_MS + 1;
    const storage = storageWith(JSON.stringify({ business: promptedAt }));
    expect(canPromptAbandonIntent({ ...base, storage })).toBe(false);
    expect(canPromptAbandonIntent({ ...base, now: promptedAt + ABANDON_INTENT_COOLDOWN_MS, storage })).toBe(true);
  });

  it("keeps the cooldown per workspace", () => {
    const storage = storageWith(JSON.stringify({ business: base.now }));
    expect(canPromptAbandonIntent({ ...base, businessId: "other", storage })).toBe(true);
  });

  it("prompts when stored state is unreadable", () => {
    expect(canPromptAbandonIntent({ ...base, storage: storageWith("not json") })).toBe(true);
  });

  it("survives storage being unavailable", () => {
    expect(canPromptAbandonIntent({ ...base, storage: undefined })).toBe(true);
    expect(() => markAbandonIntentPrompted("business", base.now, undefined)).not.toThrow();
  });

  it("records one workspace without dropping another", () => {
    const storage = storageWith(JSON.stringify({ first: 10 }));
    markAbandonIntentPrompted("second", 20, storage);
    expect(JSON.parse(storage.store[ABANDON_INTENT_STORAGE_KEY]!)).toEqual({ first: 10, second: 20 });
  });
});

describe("exit intent detection", () => {
  it("fires when the pointer leaves through the top of the viewport", () => {
    expect(isExitIntentEvent({ clientY: 0, relatedTarget: null })).toBe(true);
    expect(isExitIntentEvent({ clientY: -5, relatedTarget: null })).toBe(true);
  });

  it("ignores movement between elements and away from the top edge", () => {
    expect(isExitIntentEvent({ clientY: 0, relatedTarget: {} as EventTarget })).toBe(false);
    expect(isExitIntentEvent({ clientY: 40, relatedTarget: null })).toBe(false);
  });
});
