import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
const markPageIntroSeen = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@lobbystack/domain", () => ({ markPageIntroSeen }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

const post = (body: unknown) => POST(new Request("https://app.example/api/page-intros", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  resetFakeOperator();
  markPageIntroSeen.mockClear();
});

it("records the closed card for the signed-in person", async () => {
  const response = await post({ intro: "knowledge" });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ intro: "knowledge" });
  expect(markPageIntroSeen).toHaveBeenCalledWith(fakeOperator.domain, { userId: "user", intro: "knowledge" });
});

it("records the first dashboard visit", async () => {
  await post({ intro: "dashboard" });
  expect(markPageIntroSeen).toHaveBeenCalledWith(fakeOperator.domain, { userId: "user", intro: "dashboard" });
});

it("refuses a page that has no card", async () => {
  for (const intro of ["contacts", "", 3, null]) {
    const response = await post({ intro });
    expect(response.status).toBe(400);
  }
  expect(markPageIntroSeen).not.toHaveBeenCalled();
});

it("refuses a body over a kilobyte", async () => {
  const response = await post({ intro: "inbox", padding: "x".repeat(2000) });
  expect(response.status).toBe(413);
  expect(markPageIntroSeen).not.toHaveBeenCalled();
});
