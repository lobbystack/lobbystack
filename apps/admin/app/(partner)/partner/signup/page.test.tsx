import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Preview = { email: string; status: string; expired: boolean } | null;
const fixture = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string | null; emailVerified: boolean } } | null,
  preview: null as Preview,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@lobbystack/domain", () => ({ hashPartnerToken: (token: string) => `hash:${token}`, previewPartnerSignupInvitation: vi.fn(async () => fixture.preview) }));
vi.mock("@/lib/auth", () => ({ getSession: async () => fixture.session }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: {} }) }));
vi.mock("@/components/partner-signup-surface", () => ({ PartnerSignupSurface: () => null }));
vi.mock("@/components/guest-auth-card", () => ({ GuestAuthCard: () => null }));

import { previewPartnerSignupInvitation } from "@lobbystack/domain";
import { GuestAuthCard } from "@/components/guest-auth-card";
import { PartnerSignupSurface } from "@/components/partner-signup-surface";
import PartnerSignupPage from "./page";

type SignupProps = { baseDomain: string | null; blocked: string | null; invitation: string | null; invitedEmail: string | null; returnTo: string };
const signedIn = (email: string | null, emailVerified = true) => ({ user: { id: "user", email, emailVerified } });
const page = async (invitation?: string, extra: Record<string, string> = {}) => await PartnerSignupPage({ searchParams: Promise.resolve({ ...(invitation === undefined ? {} : { invitation }), ...extra }) }) as ReactElement<SignupProps>;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.session = signedIn("owner@acme.example");
  fixture.preview = null;
  vi.stubEnv("PARTNER_BASE_DOMAIN", "");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("partner signup while signup is invite-only", () => {
  beforeEach(() => { vi.stubEnv("DEPLOYMENT_MODE", "cloud"); vi.stubEnv("PARTNER_SIGNUP", ""); });

  it("asks for an invitation when the link has none, signed in or not", async () => {
    expect((await page()).props).toMatchObject({ blocked: "inviteOnly", invitation: null });
    fixture.session = null;
    const form = await page();
    expect(form.type).toBe(PartnerSignupSurface);
    expect(form.props.blocked).toBe("inviteOnly");
    expect(previewPartnerSignupInvitation).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown link", null, "invitationInvalid"],
    ["a revoked link", { email: "owner@acme.example", status: "revoked", expired: false }, "invitationInvalid"],
    ["an expired link", { email: "owner@acme.example", status: "pending", expired: true }, "invitationInvalid"],
    ["a used link", { email: "owner@acme.example", status: "accepted", expired: false }, "invitationUsed"],
  ] as const)("refuses %s", async (_label, preview, blocked) => {
    fixture.preview = preview;
    expect((await page("token")).props.blocked).toBe(blocked);
    expect(previewPartnerSignupInvitation).toHaveBeenCalledWith(expect.anything(), { tokenHash: "hash:token" });
  });

  it("refuses an account other than the verified one the invitation names", async () => {
    fixture.preview = { email: "owner@acme.example", status: "pending", expired: false };
    fixture.session = signedIn("someone@else.example");
    expect((await page("token")).props).toMatchObject({ blocked: "wrongAccount", invitedEmail: "owner@acme.example" });
    fixture.session = signedIn("owner@acme.example", false);
    expect((await page("token")).props.blocked).toBe("wrongAccount");
  });

  it("opens the form for the invited account, carrying the invitation", async () => {
    vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
    fixture.preview = { email: "owner@acme.example", status: "pending", expired: false };
    fixture.session = signedIn(" Owner@Acme.Example ");
    expect((await page("token")).props).toEqual({ baseDomain: "portal.example.test", blocked: null, invitation: "token", invitedEmail: "owner@acme.example", returnTo: "/partner/signup?invitation=token", signedIn: true });
  });

  it("has a signed-out visitor with a valid invitation make their account here, then come back to the same link", async () => {
    fixture.preview = { email: "owner@acme.example", status: "pending", expired: false };
    fixture.session = null;
    const signedOut = await page("token") as unknown as ReactElement<{ mode: string; partner: { returnTo: string } }>;
    expect(signedOut.type).toBe(GuestAuthCard);
    expect(signedOut.props).toEqual({ mode: "signup", partner: { returnTo: "/partner/signup?invitation=token" } });
  });
});

describe("partner signup links that stopped working", () => {
  beforeEach(() => { vi.stubEnv("DEPLOYMENT_MODE", "cloud"); vi.stubEnv("PARTNER_SIGNUP", ""); });

  it("tells a signed-out visitor so, with a way to sign in", async () => {
    fixture.session = null;
    expect((await page()).props).toMatchObject({ blocked: "inviteOnly", signedIn: false });
  });

  it("still lets the sign-up card record a Google sign-up that came back after the invitation was used", async () => {
    fixture.preview = { email: "owner@acme.example", status: "accepted", expired: false };
    const card = await page("token", { google: "signup" }) as unknown as ReactElement<{ mode: string; partner: { returnTo: string } }>;
    expect(card.type).toBe(GuestAuthCard);
    // The card then reloads the link without the marker, which says the invitation was used.
    expect(card.props.partner.returnTo).toBe("/partner/signup?invitation=token");
  });

  it("lets someone joining a partner's team make their account here, then go back to the team invitation", async () => {
    fixture.session = null;
    const card = await page(undefined, { returnTo: "/partner/accept-invite?token=team" }) as unknown as ReactElement<{ mode: string; partner: { returnTo: string } }>;
    expect(card.type).toBe(GuestAuthCard);
    expect(card.props).toEqual({ mode: "signup", partner: { returnTo: "/partner/accept-invite?token=team" } });
    // Any other place to go back to still needs a signup invitation.
    expect((await page(undefined, { returnTo: "/partner/id/team" })).props).toMatchObject({ blocked: "inviteOnly" });
  });
});

describe("partner signup while signup is open", () => {
  beforeEach(() => { vi.stubEnv("DEPLOYMENT_MODE", "self_hosted_standard"); vi.stubEnv("PARTNER_SIGNUP", ""); });

  it("opens the form for anyone signed in, ignoring an invitation in the link", async () => {
    expect((await page("token")).props).toMatchObject({ blocked: null, invitation: null, invitedEmail: null });
    expect(previewPartnerSignupInvitation).not.toHaveBeenCalled();
  });

  it("has a signed-out visitor make their account first", async () => {
    fixture.session = null;
    expect((await page()).type).toBe(GuestAuthCard);
  });

  it("lets the sign-up card record a Google sign-in before it shows the form", async () => {
    expect((await page(undefined, { google: "signup" })).type).toBe(GuestAuthCard);
    expect((await page()).type).toBe(PartnerSignupSurface);
  });
});
