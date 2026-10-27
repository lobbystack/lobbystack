// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const fixture = vi.hoisted(() => ({
  partner: { partnerId: "partner", name: "Bright Desk", role: "owner" as "owner" | "admin" | "member" },
  telemetry: null as ReturnType<typeof createRecordedBrowserTelemetry> | null,
  search: new URLSearchParams(),
  replace: vi.fn(),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/partner/partner/payments", useRouter: () => ({ replace: fixture.replace }), useSearchParams: () => fixture.search }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => fixture.telemetry!.telemetry }));

import { PartnerStripeSurface } from "./partner-stripe-surface";

const none = { configured: true, status: "not_connected", accountId: null, country: null, currency: null, detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false, disconnectedAt: null };
const onboarding = { ...none, status: "onboarding", accountId: "acct_bright", country: "CA" };
const active = { ...onboarding, status: "active", currency: "CAD", detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true };
const assign = vi.fn();

beforeEach(() => {
  fixture.telemetry = createRecordedBrowserTelemetry();
  fixture.search = new URLSearchParams();
  fixture.partner = { ...fixture.partner, role: "owner" };
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function renderWith(respond: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => respond(url, init));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PartnerStripeSurface /></QueryClientProvider>);
  return fetchMock;
}

const posts = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");

describe("the partner console's Stripe page", () => {
  it("connects a new account in the country the owner picks, records web.partner.stripe_onboarding_started and opens Stripe", async () => {
    const fetchMock = renderWith((url) => url.startsWith("/api/partner/stripe/onboarding") ? Response.json({ url: "https://connect.stripe.com/setup/s/abc" }) : Response.json(none));
    expect(await screen.findByText("stripe.connect.title")).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("stripe.connect.countryLabel"), "CA");
    await userEvent.click(screen.getByRole("button", { name: "stripe.connect.action" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://connect.stripe.com/setup/s/abc"));
    const [url, init] = posts(fetchMock)[0]!;
    expect(url).toBe("/api/partner/stripe/onboarding");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ partnerId: "partner", country: "CA" });
    fixture.telemetry!.expectEvent("web.partner.stripe_onboarding_started", { partnerId: "partner", resumed: false, pathname: "/partner/partner/payments" });
  });

  it("continues onboarding an account that has one, without asking for a country", async () => {
    const fetchMock = renderWith((url) => url.startsWith("/api/partner/stripe/onboarding") ? Response.json({ url: "https://connect.stripe.com/setup/s/again" }) : Response.json(onboarding));
    await userEvent.click(await screen.findByRole("button", { name: "stripe.onboarding.action" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://connect.stripe.com/setup/s/again"));
    expect(screen.queryByLabelText("stripe.connect.countryLabel")).toBeNull();
    expect(JSON.parse(String((posts(fetchMock)[0]![1] as RequestInit).body))).toEqual({ partnerId: "partner" });
    fixture.telemetry!.expectEvent("web.partner.stripe_onboarding_started", { partnerId: "partner", resumed: true, pathname: "/partner/partner/payments" });
  });

  it("asks Stripe for the account when the owner comes back, then drops the query from the address", async () => {
    fixture.search = new URLSearchParams("onboarding=return");
    const fetchMock = renderWith(() => Response.json(active));
    expect(await screen.findByText("stripe.active.title")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/partner/stripe?partnerId=partner&refresh=1", expect.anything());
    await waitFor(() => expect(fixture.replace).toHaveBeenCalledWith("/partner/partner/payments"));
    expect(screen.getByText("acct_bright")).toBeTruthy();
    expect(screen.getByText("CAD")).toBeTruthy();
    expect(screen.getByRole("link", { name: "stripe.active.dashboard" }).getAttribute("href")).toBe("https://dashboard.stripe.com/");
  });

  it("opens a new link by itself when Stripe sends back an owner whose link expired", async () => {
    fixture.search = new URLSearchParams("onboarding=refresh");
    const fetchMock = renderWith((url) => url.startsWith("/api/partner/stripe/onboarding") ? Response.json({ url: "https://connect.stripe.com/setup/s/fresh" }) : Response.json(onboarding));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://connect.stripe.com/setup/s/fresh"));
    expect(posts(fetchMock)).toHaveLength(1);
  });

  it("says why Stripe didn't open, and records nothing", async () => {
    renderWith((url) => url.startsWith("/api/partner/stripe/onboarding") ? Response.json({ error: "Choose the country your business is in.", code: "invalid_country" }, { status: 400 }) : Response.json(none));
    await screen.findByText("stripe.connect.title");
    await userEvent.selectOptions(screen.getByLabelText("stripe.connect.countryLabel"), "FR");
    await userEvent.click(screen.getByRole("button", { name: "stripe.connect.action" }));
    expect((await screen.findByRole("alert")).textContent).toBe("stripe.errors.invalidCountry");
    expect(assign).not.toHaveBeenCalled();
    expect(fixture.telemetry!.events).toEqual([]);
  });

  it("tells the owner when the deployment has no Stripe Connect, and offers nothing to click", async () => {
    renderWith(() => Response.json({ ...none, configured: false }));
    expect(await screen.findByText("stripe.notConfigured.title")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows a disconnected account's date and asks for a country to connect a new one", async () => {
    renderWith(() => Response.json({ ...active, status: "disconnected", disconnectedAt: "2026-10-20T12:00:00.000Z" }));
    expect(await screen.findByText("stripe.disconnected.title")).toBeTruthy();
    expect(screen.getByLabelText("stripe.connect.countryLabel")).toBeTruthy();
    expect(screen.getByRole("button", { name: "stripe.disconnected.action" })).toBeTruthy();
  });

  it("shows admins and members that only owners manage Stripe, without asking the server", async () => {
    fixture.partner = { ...fixture.partner, role: "admin" };
    const fetchMock = renderWith(() => Response.json(none));
    expect(await screen.findByText("stripe.ownersOnly")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
