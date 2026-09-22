import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ insert: vi.fn(), consume: vi.fn(), where: vi.fn() }));
vi.mock("./auth", () => ({ getAuthDatabase: () => ({ db: { insert: () => ({ values: mocks.insert }), delete: () => ({ where: mocks.where }) } }) }));
import { createCalendarOAuthState } from "./google-calendar-oauth";
import { consumeCalendarOAuthState, storeCalendarOAuthState } from "./google-calendar-oauth-store";

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("BETTER_AUTH_SECRET", "fixture-secret"); mocks.insert.mockResolvedValue(undefined); mocks.where.mockReturnValue({ returning: mocks.consume }); });
afterEach(() => vi.unstubAllEnvs());

it("stores a hashed state identifier rather than the bearer state", async () => {
  const state = createCalendarOAuthState({ userId: "user", businessId: "business" });
  await storeCalendarOAuthState(state);
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ identifier: expect.stringMatching(/^google-calendar:[a-f0-9]{64}$/), value: "user:business" }));
  expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain(state);
});

it("accepts one atomic consume and rejects a replay", async () => {
  const state = createCalendarOAuthState({ userId: "user", businessId: "business" });
  mocks.consume.mockResolvedValueOnce([{ id: "fixture" }]).mockResolvedValueOnce([]);
  await expect(consumeCalendarOAuthState(state, "user", "business")).resolves.toBe(true);
  await expect(consumeCalendarOAuthState(state, "user", "business")).resolves.toBe(false);
});

it("rejects invalid state and user or business mismatches before touching storage", async () => {
  const state = createCalendarOAuthState({ userId: "user", businessId: "business" });
  await expect(consumeCalendarOAuthState(state, "other", "business")).resolves.toBe(false);
  await expect(consumeCalendarOAuthState(state, "user", "other")).resolves.toBe(false);
  await expect(consumeCalendarOAuthState("legacy.signature", "user", "business")).resolves.toBe(false);
  expect(mocks.where).not.toHaveBeenCalled();
});
