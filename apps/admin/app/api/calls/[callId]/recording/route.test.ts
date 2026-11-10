import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => {
  class FakeLocalStorage {}
  return { FakeLocalStorage, storage: { current: null as unknown } };
});
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/storage", () => ({ getStorageProvider: () => fixture.storage.current }));
vi.mock("@lobbystack/providers/storage/local", () => ({ LocalStorageProvider: fixture.FakeLocalStorage }));
const callId = "5505ff8b-629e-4c04-86ec-d18fceeae3b2";
const download = vi.hoisted(() => vi.fn());
vi.mock("@lobbystack/domain", () => ({
  createObjectDownload: download,
  getCallDetail: vi.fn(async () => ({ recording: { state: "available", objectId: "object" } })),
}));

import { GET } from "./route";

const params = { params: Promise.resolve({ callId }) };
const signed = "https://tunnel.example/api/storage/local?token=abc.def";
beforeEach(() => { vi.clearAllMocks(); download.mockResolvedValue({ url: signed, fileName: "call.wav", contentType: "audio/wav", length: 10 }); });

describe("call recording download", () => {
  it("serves local storage from the dashboard's own origin, whatever host signed the URL", async () => {
    fixture.storage.current = new fixture.FakeLocalStorage();
    const body = await (await GET(new Request(`http://app.lobbystack.localhost:23000/api/calls/${callId}/recording`), params)).json();
    expect(body.url).toBe("/api/storage/local?token=abc.def");
  });

  it("leaves a cloud storage URL as it was signed", async () => {
    fixture.storage.current = {};
    const body = await (await GET(new Request(`http://app.lobbystack.localhost:23000/api/calls/${callId}/recording`), params)).json();
    expect(body.url).toBe(signed);
  });
});
