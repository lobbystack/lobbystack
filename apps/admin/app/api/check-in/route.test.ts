import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ recordCheckInAnswer: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ recordCheckInAnswer: mocks.recordCheckInAnswer }));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({ db: "app" }) }));

import { POST } from "./route";

const post = (body: string) => POST(new Request("https://app.example.test/api/check-in", { method: "POST", body }));

describe("POST /api/check-in", () => {
  beforeEach(() => mocks.recordCheckInAnswer.mockReset());

  it("records the answer the token carries", async () => {
    mocks.recordCheckInAnswer.mockResolvedValue({ answer: "still_testing" });
    const response = await post(JSON.stringify({ token: "v1.token.sig" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ answer: "still_testing" });
    expect(mocks.recordCheckInAnswer).toHaveBeenCalledWith({ db: "app" }, { token: "v1.token.sig" });
  });

  it("refuses a token that doesn't read, and a malformed body", async () => {
    mocks.recordCheckInAnswer.mockResolvedValue(null);
    expect((await post(JSON.stringify({ token: "tampered" }))).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
  });
});
