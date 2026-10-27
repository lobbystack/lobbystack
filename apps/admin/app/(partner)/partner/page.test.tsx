import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ session: { user: { id: "user" } } as { user: { id: string } } | null, partners: [] as Array<{ partnerId: string }>, headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => fixture.headers }));
// Next's redirect and notFound throw, so nothing after them runs.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); }),
  notFound: vi.fn(() => { throw Object.assign(new Error("NEXT_NOT_FOUND"), { notFound: true }); }),
}));
vi.mock("@lobbystack/domain", () => ({ listUserPartners: vi.fn(async () => fixture.partners) }));
vi.mock("@/lib/auth", () => ({ getSession: async () => fixture.session }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: {} }) }));

import { listUserPartners } from "@lobbystack/domain";
import PartnerConsoleHome from "./page";

const FIRST = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const SECOND = "0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f";
/** The headers the proxy sets on a partner's host. */
const onPartnerHost = (partnerId: string) => new Headers({ "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test" });

beforeEach(() => {
  vi.clearAllMocks();
  fixture.session = { user: { id: "user" } };
  fixture.partners = [];
  fixture.headers = new Headers({ "x-lobbystack-brand": "host" });
});

it("opens the console on the person's first partner, on the host's domain", async () => {
  fixture.partners = [{ partnerId: "first" }, { partnerId: "second" }];
  await expect(PartnerConsoleHome()).rejects.toMatchObject({ to: "/partner/first/businesses" });
  expect(listUserPartners).toHaveBeenCalledWith(expect.anything(), "user");
});

it("sends someone on no partner's team to partner signup", async () => {
  await expect(PartnerConsoleHome()).rejects.toMatchObject({ to: "/partner/signup" });
});

it("sends a signed-out visitor to White Label sign-in, then back to the console", async () => {
  fixture.session = null;
  await expect(PartnerConsoleHome()).rejects.toMatchObject({ to: "/partner/login?returnTo=%2Fpartner" });
  expect(listUserPartners).not.toHaveBeenCalled();
});

it("opens only the host's partner on a partner's host, and nobody else's console there", async () => {
  fixture.partners = [{ partnerId: FIRST }, { partnerId: SECOND }];
  fixture.headers = onPartnerHost(SECOND);
  await expect(PartnerConsoleHome()).rejects.toMatchObject({ to: `/partner/${SECOND}/businesses` });
  // Someone off that partner's team gets a 404: partner signup stays on the host's domain.
  fixture.partners = [{ partnerId: FIRST }];
  await expect(PartnerConsoleHome()).rejects.toMatchObject({ notFound: true });
  fixture.partners = [];
  await expect(PartnerConsoleHome()).rejects.toMatchObject({ notFound: true });
});
