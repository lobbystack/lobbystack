import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  headers: new Headers(),
  session: { user: { id: "user", email: "owner@example.test" } } as { user: { id: string; email: string } } | null,
  partners: [] as Array<{ partnerId: string; name: string; slug: string; role: "owner" | "admin" | "member"; subdomain: string | null }>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => fixture.headers }));
// Next's redirect throws, so nothing after it runs.
vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); }) }));
vi.mock("@lobbystack/domain", () => ({ listUserPartners: async () => fixture.partners }));
vi.mock("@/lib/auth", () => ({ getSession: async () => fixture.session }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: {} }) }));
vi.mock("@/components/partner-shell", () => ({ PartnerShell: () => null }));

import { PATHNAME_HEADER } from "@/lib/locale-request";
import PartnerConsoleLayout from "./layout";

const PARTNER = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const OTHER = "0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f";
const open = (partnerId: string) => PartnerConsoleLayout({ children: null, params: Promise.resolve({ partnerId }) });

beforeEach(() => {
  fixture.headers = new Headers({ "x-lobbystack-brand": "host", "x-lobbystack-pathname": `/partner/${PARTNER}/team` });
  fixture.session = { user: { id: "user", email: "owner@example.test" } };
  fixture.partners = [
    { partnerId: PARTNER, name: "Bright Desk", slug: "bright-desk", role: "admin", subdomain: null },
    { partnerId: OTHER, name: "Second Shop", slug: "second-shop", role: "member", subdomain: null },
  ];
});

it("opens the console of a partner the person is on the team of, with their role and a switcher", async () => {
  const shell = await open(PARTNER.toUpperCase()) as ReactElement<{ partner: unknown; partners: unknown[]; user: unknown }>;
  expect(shell.props.partner).toEqual({ partnerId: PARTNER, name: "Bright Desk", role: "admin" });
  expect(shell.props.partners).toEqual([{ partnerId: PARTNER, name: "Bright Desk", role: "admin" }, { partnerId: OTHER, name: "Second Shop", role: "member" }]);
  expect(shell.props.user).toEqual({ email: "owner@example.test" });
});

it("tells the shell whether the deployment sells tiers, which decides whether owners see Billing", async () => {
  expect(((await open(PARTNER)) as ReactElement<{ tierBilling: boolean }>).props.tierBilling).toBe(false);
  for (const tier of ["STARTER", "GROWTH", "SCALE"]) for (const interval of ["MONTHLY", "ANNUAL"]) vi.stubEnv(`POLAR_PARTNER_${tier}_${interval}_PRODUCT_ID`, `prod_${tier}_${interval}`);
  expect(((await open(PARTNER)) as ReactElement<{ tierBilling: boolean }>).props.tierBilling).toBe(true);
  vi.unstubAllEnvs();
});

it("sends anyone off the partner's team back to /partner, whether the id is someone else's or not an id at all", async () => {
  fixture.partners = fixture.partners.filter((partner) => partner.partnerId !== PARTNER);
  await expect(open(PARTNER)).rejects.toMatchObject({ to: "/partner" });
  await expect(open("businesses")).rejects.toMatchObject({ to: "/partner" });
});

it("sends a signed-out visitor to sign in, then back to the page they asked for", async () => {
  fixture.session = null;
  expect(PATHNAME_HEADER).toBe("x-lobbystack-pathname");
  await expect(open(PARTNER)).rejects.toMatchObject({ to: `/en/login?returnTo=${encodeURIComponent(`/partner/${PARTNER}/team`)}` });
});

it("opens only the host's partner on a partner's host, with no other partner in the switcher", async () => {
  fixture.headers = new Headers({ "x-lobbystack-brand": `partner:${PARTNER}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test", "x-lobbystack-pathname": `/partner/${PARTNER}/team` });
  const shell = await open(PARTNER) as ReactElement<{ partner: unknown; partners: unknown[] }>;
  expect(shell.props.partner).toEqual({ partnerId: PARTNER, name: "Bright Desk", role: "admin" });
  expect(shell.props.partners).toEqual([{ partnerId: PARTNER, name: "Bright Desk", role: "admin" }]);
  // The person's other partner opens only on the host's domain or its own host.
  await expect(open(OTHER)).rejects.toMatchObject({ to: "/partner" });
});
