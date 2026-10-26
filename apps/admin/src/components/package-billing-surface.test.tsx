// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() }, router: { replace: vi.fn() }, search: new URLSearchParams() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ useRouter: () => fixture.router, useSearchParams: () => fixture.search }));
vi.mock("@/hooks/use-active-business", () => ({ useActiveBusiness: () => ({ business: { businessId: "business", role: "business_owner", partnerAccessLevel: "full" } }) }));
vi.mock("sonner", () => ({ toast: fixture.toast }));

import { PackageBillingSurface } from "./package-billing-surface";

const frontDesk = { packageName: "Front desk", allowance: { voiceMinutes: 300, chats: 1000 } };

beforeEach(() => { fixture.search = new URLSearchParams(); window.history.replaceState({}, "", "/settings/subscription"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function renderWith(respond: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => respond(url, init));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PackageBillingSurface /></QueryClientProvider>);
  return fetchMock;
}

it("tells a business its partner bills outside LobbyStack to ask the partner", async () => {
  renderWith(() => Response.json({ billing: "outside" }));
  expect(await screen.findByText("subscription.outside")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

it("shows the package and its renewal, and opens the partner's customer portal", async () => {
  // A hash on this page stands in for Stripe's portal, since jsdom only follows those.
  const portalUrl = `${window.location.href}#stripe-portal`;
  const fetchMock = renderWith((url) => url.startsWith("/api/package-billing/portal")
    ? Response.json({ url: portalUrl })
    : Response.json({ billing: "package", offer: { ...frontDesk, status: "active" }, currentPeriodEnd: "2026-11-26T00:00:00.000Z", canOpenPortal: true, canSubscribe: false }));
  expect(await screen.findByText("Front desk")).toBeTruthy();
  expect(screen.getByText("subscription.badge.active")).toBeTruthy();
  expect(screen.getByText("subscription.allowance")).toBeTruthy();
  // Only Stripe shows the business what it pays.
  expect(document.body.textContent).not.toMatch(/subscription\.(perMonth|setupFee)|149/);
  expect(screen.getByText("subscription.status.renews")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "subscription.subscribe" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "subscription.manage" }));
  await waitFor(() => expect(window.location.hash).toBe("#stripe-portal"));
  expect(fetchMock).toHaveBeenCalledWith("/api/package-billing/portal?businessId=business", expect.objectContaining({ method: "POST" }));
});

it("offers a checkout once the subscription ended, and says when the partner can't take payments", async () => {
  renderWith((url) => url.startsWith("/api/package-billing/checkout")
    ? Response.json({ error: "No payments", code: "payments_unavailable" }, { status: 409 })
    : Response.json({ billing: "package", offer: { ...frontDesk, status: "inactive" }, currentPeriodEnd: null, canOpenPortal: true, canSubscribe: true }));
  expect(await screen.findByText("subscription.status.inactive")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "subscription.subscribe" }));
  await waitFor(() => expect(fixture.toast.error).toHaveBeenCalledWith("subscription.errors.unavailable"));
});

it("thanks the owner when Stripe sends them back paid", async () => {
  fixture.search = new URLSearchParams("checkout=complete");
  renderWith(() => Response.json({ billing: "package", offer: { ...frontDesk, status: "awaiting_payment" }, currentPeriodEnd: null, canOpenPortal: false, canSubscribe: true }));
  await screen.findByText("Front desk");
  expect(fixture.toast.success).toHaveBeenCalledWith("subscription.paid");
  expect(fixture.router.replace).toHaveBeenCalledWith("/settings/subscription");
});
