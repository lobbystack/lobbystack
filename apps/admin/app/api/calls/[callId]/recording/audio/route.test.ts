import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  session: null as unknown,
  /** The businesses the signed-in person can open. */
  memberOf: [] as string[],
  /** The calls each business has, with their recording's object. */
  calls: new Map<string, { businessId: string; objectId: string }>(),
  bytes: new Uint8Array(0),
  opened: [] as Array<{ key: string; range?: string }>,
}));
vi.mock("@/lib/auth", () => ({ getSession: async () => fixture.session }));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({ db: "app" }) }));
vi.mock("@lobbystack/db", async (original) => ({
  ...await original<typeof import("@lobbystack/db")>(),
  withBusinessTransaction: async (_db: unknown, _context: unknown, callback: (tx: unknown) => unknown) => await callback({}),
}));
vi.mock("@lobbystack/domain", () => ({
  readActiveBusinessId: async () => null,
  requireBusinessAccess: async (_tx: unknown, { businessId }: { businessId: string }) => {
    if (!fixture.memberOf.includes(businessId)) throw Object.assign(new Error("Business not found."), { status: 404 });
    return { businessId, via: "membership", role: "viewer", partnerRole: null, partnerId: null, accessLevel: null };
  },
  getCallDetail: async (_domain: unknown, { businessId, callId }: { businessId: string; callId: string }) => {
    const call = fixture.calls.get(callId);
    return call && call.businessId === businessId ? { recording: { state: "available", objectId: call.objectId } } : null;
  },
  findDownloadableObject: async (_domain: unknown, { objectId }: { objectId: string }) => ({ objectKey: `recordings/${objectId}.wav`, fileName: "Call à 9h.wav", contentType: "audio/wav", contentLength: fixture.bytes.byteLength }),
}));
vi.mock("@/lib/storage", async () => {
  const { byteRange } = await import("@lobbystack/providers/storage/range");
  return {
    getStorageProvider: () => ({
      openObject: async (input: { key: string; range?: string }) => {
        fixture.opened.push(input);
        const slice = byteRange(input.range, fixture.bytes.byteLength);
        const body = slice ? fixture.bytes.subarray(slice.start, slice.end + 1) : fixture.bytes;
        return { body: Readable.from([Buffer.from(body)]), length: body.byteLength, totalLength: fixture.bytes.byteLength, ...slice };
      },
    }),
  };
});

import { GET } from "./route";

const businessId = "7d1f5a52-2f0e-4a4c-9a55-0c8a4c1b2f10";
const otherBusinessId = "0b6f8c1e-3a2d-4e5f-8a9b-1c2d3e4f5a6b";
const callId = "5505ff8b-629e-4c04-86ec-d18fceeae3b2";
const otherCallId = "9a3c2b1d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";

function request(id = callId, init: { business?: string; range?: string } = {}) {
  const url = `https://app.example.test/api/calls/${id}/recording/audio?businessId=${init.business ?? businessId}`;
  return GET(new Request(url, { headers: init.range ? { range: init.range } : {} }), { params: Promise.resolve({ callId: id }) });
}

beforeEach(() => {
  fixture.session = { user: { id: "user-1" }, session: { id: "session-1", userId: "user-1", expiresAt: new Date(0) } };
  fixture.memberOf = [businessId];
  fixture.calls = new Map([[callId, { businessId, objectId: "object-1" }], [otherCallId, { businessId: otherBusinessId, objectId: "object-2" }]]);
  fixture.bytes = Uint8Array.from({ length: 100 }, (_, index) => index);
  fixture.opened = [];
});

describe("call recording audio", () => {
  it("streams the whole recording from the dashboard's origin, as an attachment", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(response.headers.get("content-length")).toBe("100");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe("attachment; filename=\"Call _ 9h.wav\"; filename*=UTF-8''Call%20%C3%A0%209h.wav");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(fixture.bytes);
    expect(fixture.opened).toEqual([{ key: "recordings/object-1.wav" }]);
  });

  it("answers a Range request with the slice, so the audio element can seek", async () => {
    const response = await request(callId, { range: "bytes=10-19" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 10-19/100");
    expect(response.headers.get("content-length")).toBe("10");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it("answers an open-ended and a suffix range to the end of the recording", async () => {
    expect((await request(callId, { range: "bytes=90-" })).headers.get("content-range")).toBe("bytes 90-99/100");
    expect((await request(callId, { range: "bytes=-5" })).headers.get("content-range")).toBe("bytes 95-99/100");
  });

  it("answers a range past the end with 416 and the length", async () => {
    const response = await request(callId, { range: "bytes=500-" });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */100");
  });

  it("asks for a session first and never touches storage without one", async () => {
    fixture.session = null;
    expect((await request()).status).toBe(401);
    expect(fixture.opened).toEqual([]);
  });

  it("refuses a business the person isn't on", async () => {
    expect((await request(otherCallId, { business: otherBusinessId })).status).toBe(404);
    expect(fixture.opened).toEqual([]);
  });

  it("answers 404 for another business's call asked for under the person's own business", async () => {
    expect((await request(otherCallId)).status).toBe(404);
    expect(fixture.opened).toEqual([]);
  });
});
