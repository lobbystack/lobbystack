import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn(), ids: vi.fn(), update: vi.fn(), withOperatorTransaction: vi.fn(), asApiResponse: vi.fn(), completed: vi.fn() }));
vi.mock("@/lib/voice-presence", () => ({ countActiveVoiceCalls: mocks.count, getVoicePresenceCallIds: mocks.ids, removeCompletedVoicePresence: mocks.update }));
vi.mock("@/lib/api-helpers", () => ({ withOperatorTransaction: mocks.withOperatorTransaction, asApiResponse: mocks.asApiResponse }));

import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ids.mockResolvedValue([]);
  mocks.withOperatorTransaction.mockImplementation(async (_request, callback) => callback({ businessId: "authorized-business", tx: { select: () => ({ from: () => ({ where: mocks.completed }) }) } }));
});

it("returns an independent live count for the authorized business", async () => {
  mocks.count.mockResolvedValue(2);
  const request = new Request("https://app.example/api/calls/active?businessId=authorized-business");
  const response = await GET(request);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ active: 2 });
  expect(mocks.count).toHaveBeenCalledWith("authorized-business");
});

it("does not return a false zero when live presence is unavailable", async () => {
  mocks.count.mockRejectedValue(new Error("Redis unavailable"));
  mocks.asApiResponse.mockReturnValue(Response.json({ error: "Request failed." }, { status: 503 }));
  const response = await GET(new Request("https://app.example/api/calls/active"));
  expect(response.status).toBe(503);
  expect(await response.json()).not.toEqual({ active: 0 });
});

it("removes only durably completed presence before calculating the summary", async () => {
  mocks.ids.mockResolvedValue(["completed-call", "unresolved-call"]);
  mocks.completed.mockResolvedValue([{ id: "completed-call" }]);
  mocks.count.mockResolvedValue(1);
  const response = await GET(new Request("https://app.example/api/calls/active"));
  expect(response.status).toBe(200);
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ businessId: "authorized-business", callId: "completed-call" });
  expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.count.mock.invocationCallOrder[0]!);
});
