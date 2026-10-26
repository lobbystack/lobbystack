import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";

type Preview = { partnerName: string; email: string; role: "owner" | "admin" | "member"; status: string; expired: boolean } | null;
const fixture = vi.hoisted(() => ({ session: { user: { id: "user" } } as { user: { id: string } } | null, preview: null as Preview }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@lobbystack/domain", () => ({ hashPartnerToken: (token: string) => `hash:${token}`, previewPartnerInvitation: vi.fn(async () => fixture.preview) }));
vi.mock("@/lib/auth", () => ({ getSession: async () => fixture.session }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: {} }) }));
vi.mock("@/components/partner-signup-surface", () => ({ PartnerSignedOutSurface: () => null }));
vi.mock("@/components/partner-accept-invite-surface", () => ({ PartnerAcceptInviteSurface: () => null }));

import { previewPartnerInvitation } from "@lobbystack/domain";
import { PartnerAcceptInviteSurface } from "@/components/partner-accept-invite-surface";
import { PartnerSignedOutSurface } from "@/components/partner-signup-surface";
import PartnerAcceptInvitePage from "./page";

type AcceptProps = { invitation: unknown; returnTo: string; state: string; token: string };
const page = async (token?: string) => await PartnerAcceptInvitePage({ searchParams: Promise.resolve(token === undefined ? {} : { token }) }) as ReactElement<AcceptProps>;
const pending = { partnerName: "Bright Desk", email: "new@acme.example", role: "admin" as const, status: "pending", expired: false };

beforeEach(() => {
  vi.clearAllMocks();
  fixture.session = { user: { id: "user" } };
  fixture.preview = null;
});

it("offers to join with a valid invitation, signed in", async () => {
  fixture.preview = pending;
  const surface = await page(" token ");
  expect(surface.type).toBe(PartnerAcceptInviteSurface);
  expect(surface.props).toEqual({ invitation: { partnerName: "Bright Desk", email: "new@acme.example", role: "admin" }, returnTo: "/partner/accept-invite?token=token", state: "valid", token: "token" });
  expect(previewPartnerInvitation).toHaveBeenCalledWith(expect.anything(), { tokenHash: "hash:token" });
});

it.each([
  ["no token", undefined, null, "invalid"],
  ["an unknown token", "token", null, "invalid"],
  ["an accepted invitation", "token", { ...pending, status: "accepted" }, "used"],
  ["a revoked invitation", "token", { ...pending, status: "revoked" }, "used"],
  ["an expired invitation", "token", { ...pending, expired: true }, "expired"],
] as const)("says why %s can't be accepted, signed in or not", async (_label, token, preview, state) => {
  fixture.preview = preview;
  expect((await page(token)).props.state).toBe(state);
  fixture.session = null;
  const signedOut = await page(token);
  expect(signedOut.type).toBe(PartnerAcceptInviteSurface);
  expect(signedOut.props.state).toBe(state);
});

it("asks a signed-out visitor with a valid invitation to sign in as the invited address and come back", async () => {
  fixture.preview = pending;
  fixture.session = null;
  const surface = await page("token") as unknown as ReactElement<{ page: string; returnTo: string; values: unknown }>;
  expect(surface.type).toBe(PartnerSignedOutSurface);
  expect(surface.props).toEqual({ page: "acceptInvite", returnTo: "/partner/accept-invite?token=token", values: { email: "new@acme.example", partnerName: "Bright Desk" } });
});
