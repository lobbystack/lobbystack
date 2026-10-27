import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const PARTNER = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const fixture = vi.hoisted(() => ({ headers: new Headers(), state: { businessId: null as string | null, stage: "create_business", steps: [] as string[] }, released: false, partners: [] as Array<{ partnerId: string }>, brands: [] as unknown[] }));
vi.mock("next/headers", () => ({ headers: async () => fixture.headers }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); }) }));
vi.mock("@lobbystack/domain", () => ({
  getActiveOnboardingState: async (_db: unknown, _userId: string, brand: unknown) => { fixture.brands.push(brand); return fixture.state; },
  partnerReleasedBusinessTo: async (_context: unknown, input: { partnerId: string }) => fixture.released && input.partnerId === PARTNER,
  listUserPartners: async () => fixture.partners,
}));
vi.mock("@/lib/auth", () => ({ getSession: async () => ({ user: { id: "user", email: "owner@example.com" } }) }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: {} }) }));
vi.mock("@/components/no-businesses-surface", () => ({ NoBusinessesSurface: () => null }));

import NoBusinessesPage from "./page";

beforeEach(() => {
  fixture.headers = new Headers({ "x-lobbystack-brand": `partner:${PARTNER}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test" });
  fixture.state = { businessId: null, stage: "create_business", steps: [] };
  fixture.partners = [];
  fixture.released = false;
  fixture.brands = [];
});

it("shows a signed-in person with no business on the partner's host the page, under that partner", async () => {
  const page = await NoBusinessesPage() as ReactElement<{ email: string; hostUrl: string | null }>;
  expect(page.props.email).toBe("owner@example.com");
  expect(page.props.hostUrl).toBeNull();
  expect(fixture.brands).toEqual([{ kind: "partner", partnerId: PARTNER }]);
});

it("links someone whose partner released their business to the host's dashboard, where it runs now", async () => {
  vi.stubEnv("APP_BASE_URL", "https://app.example.test/");
  fixture.released = true;
  const page = await NoBusinessesPage() as ReactElement<{ hostUrl: string | null }>;
  expect(page.props.hostUrl).toBe("https://app.example.test");
  vi.unstubAllEnvs();
});

it("sends anyone it doesn't fit on: to their business, to the partner's console, or off the host's domain", async () => {
  fixture.state = { businessId: "business", stage: "website", steps: [] };
  await expect(NoBusinessesPage()).rejects.toMatchObject({ to: "/" });
  fixture.state = { businessId: null, stage: "create_business", steps: [] };
  fixture.partners = [{ partnerId: PARTNER }];
  await expect(NoBusinessesPage()).rejects.toMatchObject({ to: "/partner" });
  // Another partner's team doesn't count on this partner's host.
  fixture.partners = [{ partnerId: "0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f" }];
  await expect(NoBusinessesPage()).resolves.toBeTruthy();
  fixture.headers = new Headers({ "x-lobbystack-brand": "host" });
  await expect(NoBusinessesPage()).rejects.toMatchObject({ to: "/" });
});
