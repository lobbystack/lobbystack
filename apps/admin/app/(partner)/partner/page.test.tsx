import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ session: { user: { id: "user" } } as { user: { id: string } } | null, partners: [] as Array<{ partnerId: string }> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
// Next's redirect throws, so nothing after it runs.
vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); }) }));
vi.mock("@lobbystack/domain", () => ({ listUserPartners: vi.fn(async () => fixture.partners) }));
vi.mock("@/lib/auth", () => ({ getSession: async () => fixture.session }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: {} }) }));

import { listUserPartners } from "@lobbystack/domain";
import PartnerConsoleHome from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  fixture.session = { user: { id: "user" } };
  fixture.partners = [];
});

it("opens the console on the person's first partner, on the host's domain", async () => {
  fixture.partners = [{ partnerId: "first" }, { partnerId: "second" }];
  await expect(PartnerConsoleHome()).rejects.toMatchObject({ to: "/partner/first/businesses" });
  expect(listUserPartners).toHaveBeenCalledWith(expect.anything(), "user");
});

it("sends someone on no partner's team to partner signup", async () => {
  await expect(PartnerConsoleHome()).rejects.toMatchObject({ to: "/partner/signup" });
});

it("sends a signed-out visitor to sign in, then back to the console", async () => {
  fixture.session = null;
  await expect(PartnerConsoleHome()).rejects.toMatchObject({ to: "/en/login?returnTo=%2Fpartner" });
  expect(listUserPartners).not.toHaveBeenCalled();
});
