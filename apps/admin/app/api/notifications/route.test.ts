import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
const domain = vi.hoisted(() => ({
  listBusinessNotifications: vi.fn(async () => [{ id: "n1", kind: "payment_failed", category: "action", params: {}, href: "/workspace/billing", occurredAt: "2026-11-10T00:00:00.000Z", read: false }]),
  markBusinessNotificationsRead: vi.fn(async () => 1),
}));
vi.mock("@lobbystack/domain", () => domain);

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./read/route";
import { GET } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown) => POST(new Request("https://app.example/api/notifications/read", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  resetFakeOperator();
  domain.listBusinessNotifications.mockClear();
  domain.markBusinessNotificationsRead.mockClear();
});

it("lists the signed-in person's notifications with their access in the business", async () => {
  fakeOperator.role = "viewer";
  const response = await GET(new Request("https://app.example/api/notifications"));
  expect(response.status).toBe(200);
  expect((await response.json()).notifications).toHaveLength(1);
  const [, input] = domain.listBusinessNotifications.mock.calls[0] as unknown as [unknown, { userId: string; businessId: string; reader: { role: string } }];
  expect(input).toMatchObject({ userId: "user", businessId: "business", reader: { role: "viewer" } });
});

it("marks the named notifications read, or every one with all", async () => {
  expect((await post({ ids: [id] })).status).toBe(200);
  expect(domain.markBusinessNotificationsRead).toHaveBeenLastCalledWith(fakeOperator.domain, expect.objectContaining({ userId: "user", businessId: "business", ids: [id] }));
  expect((await post({ all: true })).status).toBe(200);
  expect(domain.markBusinessNotificationsRead).toHaveBeenLastCalledWith(fakeOperator.domain, expect.objectContaining({ all: true }));
});

it("refuses a body that names nothing or names something other than notification ids", async () => {
  for (const body of [{}, { ids: [] }, { ids: ["nope"] }, { ids: Array.from({ length: 101 }, () => id) }, { all: "yes" }]) {
    expect((await post(body)).status).toBe(400);
  }
  expect(domain.markBusinessNotificationsRead).not.toHaveBeenCalled();
});
