import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";

vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
const fixture = vi.hoisted(() => ({
  detail: vi.fn(),
  object: vi.fn(),
}));
vi.mock("@lobbystack/domain", () => ({ getCallDetail: fixture.detail, findDownloadableObject: fixture.object }));

import { GET } from "./route";

const callId = "5505ff8b-629e-4c04-86ec-d18fceeae3b2";
const businessId = "7d1f5a52-2f0e-4a4c-9a55-0c8a4c1b2f10";
const params = { params: Promise.resolve({ callId }) };
const get = () => GET(new Request(`https://app.example.test/api/calls/${callId}/recording`), params);

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fakeOperator.businessId = businessId;
  fixture.detail.mockResolvedValue({ recording: { state: "available", objectId: "object" } });
  fixture.object.mockResolvedValue({ objectKey: "recordings/object.wav", fileName: "call.wav", contentType: "audio/wav", contentLength: 10 });
});

describe("call recording", () => {
  it("points the player at the dashboard's own origin, whatever the storage provider", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: `/api/calls/${callId}/recording/audio?businessId=${businessId}`, fileName: "call.wav", contentType: "audio/wav", length: 10 });
    expect(fixture.object).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId, objectId: "object" });
  });

  it("answers 404 for a call the business doesn't have", async () => {
    fixture.detail.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    expect(fixture.object).not.toHaveBeenCalled();
  });

  it("answers 409 while the recording is pending and 410 once it expired", async () => {
    fixture.detail.mockResolvedValue({ recording: { state: "pending" } });
    expect((await get()).status).toBe(409);
    fixture.detail.mockResolvedValue({ recording: { state: "expired" } });
    expect((await get()).status).toBe(410);
    fixture.detail.mockResolvedValue({ recording: { state: "available", objectId: "object" } });
    fixture.object.mockResolvedValue(null);
    expect((await get()).status).toBe(410);
  });
});
