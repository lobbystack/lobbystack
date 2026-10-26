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
  expect((await screen.findByRole("button", { name: "acceptInvite.submit" })).hasAttribute("disabled")).toBe(true);
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
