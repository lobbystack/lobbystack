// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AcceptInviteSurface } from "./accept-invite-surface";

const spies = vi.hoisted(() => ({ success: vi.fn(), replace: vi.fn(), refresh: vi.fn(), partner: null as null | { faviconUrl: null; color: null; links: { terms: null; privacy: null; support: null } } }));
vi.mock("sonner", () => ({ toast: spies }));
vi.mock("./branding-provider", () => ({ useBranding: () => ({ appName: "Bright Desk", logoUrl: null, ready: true, partner: spies.partner }) }));
vi.mock("next/navigation", () => ({ useRouter: () => spies }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string) => key }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); spies.partner = null; window.history.replaceState({}, "", "/"); });

it("preserves main's success toast and navigates to team settings after accepting", async () => {
  window.history.replaceState({}, "", "/accept-invite?token=fixture-token");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("get-session")) return Response.json({ user: { id: "fixture" } });
    if (init?.method === "POST") return Response.json({ businessId: "business", alreadyMember: false });
    return Response.json({ invitation: { businessName: "Clinic", email: "invitee@example.invalid", expired: false, status: "pending" } });
  }));
  render(<AcceptInviteSurface />);
  const submit = await screen.findByRole("button", { name: "acceptInvite.submit" });
  await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(false));
  await userEvent.click(submit);
  await waitFor(() => expect(spies.success).toHaveBeenCalledWith("acceptInvite.success"));
  expect(spies.replace).toHaveBeenCalledWith("/settings/team");
  expect(screen.queryByText("acceptInvite.success")).toBeNull();
});

it("lands the owner a partner invited in the business, on the partner's domain", async () => {
  spies.partner = { faviconUrl: null, color: null, links: { terms: null, privacy: null, support: null } };
  window.history.replaceState({}, "", "/accept-invite?token=fixture-token");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("get-session")) return Response.json({ user: { id: "fixture" } });
    if (init?.method === "POST") return Response.json({ businessId: "business", role: "business_owner", partnerId: "partner" });
    return Response.json({ invitation: { businessName: "Harbor Dental", email: "owner@example.invalid", expired: false, status: "pending" } });
  }));
  render(<AcceptInviteSurface />);
  // The way back goes to the dashboard: an activity-only owner can't open team settings.
  expect((await screen.findByRole("link", { name: "acceptInvite.backToDashboard" })).getAttribute("href")).toBe("/");
  const submit = await screen.findByRole("button", { name: "acceptInvite.submit" });
  await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(false));
  await userEvent.click(submit);
  await waitFor(() => expect(spies.replace).toHaveBeenCalledWith("/"));
});

it("settles a failed preview into the original invalid-link state", async () => {
  window.history.replaceState({}, "", "/accept-invite?token=fixture-token");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("get-session")) return Response.json({ user: { id: "fixture" } });
    throw new Error("Offline");
  }));
  render(<AcceptInviteSurface />);
  await screen.findByText("acceptInvite.invalidLink");
  // A link that can't be accepted offers no button, only the way back.
  expect(screen.queryByRole("button", { name: "acceptInvite.submit" })).toBeNull();
  expect(screen.getByRole("link", { name: "acceptInvite.backToSettings" })).toBeTruthy();
});

it("explains a 403 and lets the user sign in with the invited account", async () => {
  window.history.replaceState({}, "", "/accept-invite?token=fixture-token");
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("get-session")) return Response.json({ user: { id: "fixture" } });
    if (url.includes("sign-out")) return Response.json({ success: true });
    if (init?.method === "POST") return Response.json({ error: "Sign in with the verified email address this invitation was sent to." }, { status: 403 });
    return Response.json({ invitation: { businessName: "Clinic", email: "invitee@example.invalid", expired: false, status: "pending" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<AcceptInviteSurface />);
  const submit = await screen.findByRole("button", { name: "acceptInvite.submit" });
  await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(false));
  await userEvent.click(submit);
  await screen.findByText("acceptInvite.wrongAccount");
  await userEvent.click(screen.getByRole("button", { name: "acceptInvite.switchAccount" }));
  await waitFor(() => expect(spies.replace).toHaveBeenCalledWith(expect.stringContaining("/login?returnTo=")));
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-out", expect.objectContaining({ method: "POST" }));
});

it("tells someone on the business's partner's team that they work in it from the partner console", async () => {
  spies.partner = { faviconUrl: null, color: null, links: { terms: null, privacy: null, support: null } };
  window.history.replaceState({}, "", "/accept-invite?token=fixture-token");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("get-session")) return Response.json({ user: { id: "fixture" } });
    if (init?.method === "POST") return Response.json({ error: "People on the business's partner's team work in it from the partner's console, so they can't join its team.", code: "partner_member_not_on_team" }, { status: 409 });
    return Response.json({ invitation: { businessName: "Harbor Dental", email: "member@example.invalid", expired: false, status: "pending" } });
  }));
  render(<AcceptInviteSurface />);
  const submit = await screen.findByRole("button", { name: "acceptInvite.submit" });
  await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(false));
  await userEvent.click(submit);
  await screen.findByText("acceptInvite.partnerMember");
  expect(spies.success).not.toHaveBeenCalled();
  expect(spies.replace).not.toHaveBeenCalled();
});

const frontDesk = { packageName: "Front desk", allowance: { voiceMinutes: 300, chats: 1000 }, status: "awaiting_payment", canPay: true };

it("opens the package's checkout on the partner's account before the owner signs in", async () => {
  spies.partner = { faviconUrl: null, color: null, links: { terms: null, privacy: null, support: null } };
  window.history.replaceState({}, "", "/accept-invite?token=fixture-token");
  // Stripe's checkout opens on another site; a hash on this page stands in for it, since jsdom only follows those.
  const checkoutUrl = `${window.location.href}#stripe-checkout`;
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes("get-session")) return Response.json({});
    if (url === "/api/team/accept/checkout") return Response.json({ url: checkoutUrl });
    return Response.json({ invitation: { businessName: "Harbor Dental", email: "owner@example.invalid", expired: false, status: "pending", payment: frontDesk } });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<AcceptInviteSurface />);
  await screen.findByText("Front desk");
  await screen.findByText("acceptInvite.payment.subtitle");
  // Only Stripe's checkout shows the price.
  expect(document.body.textContent).not.toMatch(/acceptInvite\.payment\.(perMonth|setupFee)|149/);
  // Signing in comes after paying.
  expect(screen.queryByRole("link", { name: "acceptInvite.signIn" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "acceptInvite.payment.pay" }));
  await waitFor(() => expect(window.location.hash).toBe("#stripe-checkout"));
  expect(fetchMock).toHaveBeenCalledWith("/api/team/accept/checkout", expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "fixture-token" }) }));
});

it("signs the owner in once Stripe sends them back paid, and keeps the paid state through sign-in", async () => {
  window.history.replaceState({}, "", "/accept-invite?token=fixture-token&checkout=complete");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("get-session")) return Response.json({});
    return Response.json({ invitation: { businessName: "Harbor Dental", email: "owner@example.invalid", expired: false, status: "pending", payment: frontDesk } });
  }));
  render(<AcceptInviteSurface />);
  await screen.findByText("acceptInvite.payment.paid");
  expect(screen.queryByRole("button", { name: "acceptInvite.payment.pay" })).toBeNull();
  const signIn = await screen.findByRole("link", { name: "acceptInvite.signIn" });
  expect(decodeURIComponent(signIn.getAttribute("href") ?? "")).toContain("checkout=complete");
});

it("says so when the partner can't take payments", async () => {
  window.history.replaceState({}, "", "/accept-invite?token=fixture-token");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("get-session")) return Response.json({});
    if (url === "/api/team/accept/checkout") return Response.json({ error: "No payments", code: "payments_unavailable" }, { status: 409 });
    return Response.json({ invitation: { businessName: "Harbor Dental", email: "owner@example.invalid", expired: false, status: "pending", payment: frontDesk } });
  }));
  render(<AcceptInviteSurface />);
  await userEvent.click(await screen.findByRole("button", { name: "acceptInvite.payment.pay" }));
  await screen.findByText("acceptInvite.payment.unavailable");
});

it("lets the owner sign in first while the partner's package can't be paid for yet", async () => {
  window.history.replaceState({}, "", "/accept-invite?token=fixture-token");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("get-session")) return Response.json({});
    return Response.json({ invitation: { businessName: "Harbor Dental", email: "owner@example.invalid", expired: false, status: "pending", payment: { ...frontDesk, canPay: false } } });
  }));
  render(<AcceptInviteSurface />);
  expect(await screen.findByRole("link", { name: "acceptInvite.signIn" })).toBeTruthy();
  expect(screen.getByText("acceptInvite.subtitle")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "acceptInvite.payment.pay" })).toBeNull();
});
