// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const fixture = vi.hoisted(() => ({
  partner: { partnerId: "partner", name: "Bright Desk", role: "owner" as "owner" | "admin" | "member" },
  search: new URLSearchParams(),
  replace: vi.fn(),
  telemetry: null as ReturnType<typeof createRecordedBrowserTelemetry> | null,
}));
// Each key renders with the values it interpolates, so a test can tell the tiers' buttons, and the numbers in use, apart.
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: Record<string, unknown>) => options && "tier" in options ? `${key}:${String(options.tier)}` : options && "held" in options ? `${key}:${String(options.held)}:${String(options.count ?? options.included)}` : key }) }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => fixture.telemetry!.telemetry }));
vi.mock("next/navigation", () => ({ usePathname: () => "/partner/partner/billing", useRouter: () => ({ replace: fixture.replace }), useSearchParams: () => fixture.search }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { PartnerBillingSurface } from "./partner-billing-surface";

const free = {
  billed: true, tier: "free", billingInterval: null, subscriptionState: null, pool: { voiceSeconds: 1_800, chats: 50 }, includedNumbers: 0, trialNumbers: 1, currentPeriodEnd: null, endsAt: null, hasCustomerPortal: false, numbersHeld: 0, numbersCounted: true,
  poolUsage: { periodKey: "2026-10", voiceSecondsUsed: 0, chatsUsed: 0, overageSpendCents: 0 }, poolOverage: { enabled: true, capCents: null, billed: false }, trialNumber: "available",
};
const growth = { ...free, tier: "growth", billingInterval: "monthly", subscriptionState: "active", pool: { voiceSeconds: 78_000, chats: 5_000 }, includedNumbers: 10, trialNumbers: 0, currentPeriodEnd: "2026-11-01T00:00:00.000Z", hasCustomerPortal: true, poolOverage: { enabled: true, capCents: null, billed: true }, trialNumber: null };

type Route = (url: string, init?: RequestInit) => unknown;
function renderWith(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.split("?")[0]!;
    const route = routes[`${init?.method ?? "GET"} ${path}`];
    return route ? Response.json(route(url, init)) : new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PartnerBillingSurface /></QueryClientProvider>);
  return fetchMock;
}

beforeEach(() => {
  fixture.partner = { ...fixture.partner, role: "owner" };
  fixture.search = new URLSearchParams();
  fixture.telemetry = createRecordedBrowserTelemetry();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("the partner console's Billing page", () => {
  it("tells admins and members that only owners manage billing, without asking the server", async () => {
    for (const role of ["admin", "member"] as const) {
      fixture.partner = { ...fixture.partner, role };
      const fetchMock = renderWith({});
      expect(screen.getByText("billing.ownersOnly")).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("says the businesses have no usage limit when the dashboard sells no tier", async () => {
    renderWith({ "GET /api/partner/billing": () => ({ ...free, billed: false, pool: null, poolUsage: null }) });
    expect(await screen.findByText("billing.unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /billing\.choose\.action/ })).toBeNull();
  });

  it("shows Free and opens a Polar checkout for the tier and interval the owner picks", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const started: unknown[] = [];
    renderWith({
      "GET /api/partner/billing": () => free,
      "POST /api/partner/billing/checkout": (_url, init) => { started.push(JSON.parse(String(init?.body))); return { requestId: "request-1" }; },
      "GET /api/partner/billing/checkout": () => ({ requestId: "request-1", tier: "growth", status: "ready", checkoutUrl: "https://polar.example.test/co_1", synced: false }),
    });
    expect(await screen.findByText("billing.current.free")).toBeTruthy();
    // Free lists its one 14-day trial number, which one of the partner's businesses can still get.
    expect(screen.getByText("billing.terms.trialNumber")).toBeTruthy();
    expect(screen.getByText("billing.trial.available")).toBeTruthy();
    expect(screen.queryByText("billing.terms.noNumbers")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "billing.intervals.monthly" }));
    await userEvent.click(screen.getByRole("button", { name: "billing.choose.action:billing.tiers.growth" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://polar.example.test/co_1"));
    expect(started).toEqual([{ partnerId: "partner", tier: "growth", billingInterval: "monthly" }]);
  });

  it("says when the partner used its trial number, and says nothing of one where the deployment offers none", async () => {
    renderWith({ "GET /api/partner/billing": () => ({ ...free, trialNumber: "used" }) });
    expect(await screen.findByText("billing.trial.used")).toBeTruthy();
    cleanup();
    renderWith({ "GET /api/partner/billing": () => ({ ...free, trialNumber: null }) });
    expect(await screen.findByText("billing.terms.noNumbers")).toBeTruthy();
    expect(screen.queryByText(/billing\.trial\./)).toBeNull();
  });

  it("explains a refused checkout", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => init?.method === "POST"
      ? Response.json({ error: "Another owner's checkout is already open.", code: "checkout_in_progress" }, { status: 409 })
      : Response.json(free)));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PartnerBillingSurface /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "billing.choose.action:billing.tiers.scale" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("billing.errors.checkoutInProgress"));
  });

  it("shows a paid tier with its renewal and a way to manage it in Polar, and offers no second checkout", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    renderWith({
      "GET /api/partner/billing": () => ({ ...growth, subscriptionState: "past_due" }),
      "POST /api/partner/billing/portal": () => ({ url: "https://polar.example.test/portal" }),
    });
    expect(await screen.findByText("billing.tiers.growth")).toBeTruthy();
    expect(screen.getByText("billing.current.renewsOn")).toBeTruthy();
    expect(screen.getByText("billing.pastDue")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /billing\.choose\.action/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "billing.portal.action" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://polar.example.test/portal"));
  });

  it("counts the numbers the businesses use against the paid tier's included ones, and the extra ones the partner pays for", async () => {
    renderWith({ "GET /api/partner/billing": () => ({ ...growth, numbersHeld: 4 }) });
    expect(await screen.findByText("billing.numbers.used:4:10")).toBeTruthy();
    expect(screen.getByText("billing.terms.extraNumbers")).toBeTruthy();
    cleanup();
    renderWith({ "GET /api/partner/billing": () => ({ ...growth, numbersHeld: 13 }) });
    expect(await screen.findByText("billing.numbers.extra:13:3")).toBeTruthy();
    cleanup();
    // Free includes no number and pays for none, so the page shows no count, and only the three paid tiers on offer list extra numbers.
    renderWith({ "GET /api/partner/billing": () => free });
    expect(await screen.findByText("billing.current.free")).toBeTruthy();
    expect(screen.queryByText(/billing\.numbers\./)).toBeNull();
    expect(screen.getAllByText("billing.terms.extraNumbers")).toHaveLength(3);
  });

  it("says nothing about phone numbers while the deployment doesn't count them", async () => {
    renderWith({ "GET /api/partner/billing": () => ({ ...growth, numbersHeld: 13, numbersCounted: false }) });
    expect(await screen.findByText("billing.tiers.growth")).toBeTruthy();
    expect(screen.queryByText(/billing\.numbers\./)).toBeNull();
    expect(screen.queryByText(/billing\.terms\.(numbers|noNumbers|extraNumbers)/)).toBeNull();
  });

  it("waits for Polar's events after the owner pays, then says the tier is on and records web.partner.tier_started", async () => {
    fixture.search = new URLSearchParams({ checkout: "request-1" });
    let synced = false;
    renderWith({
      "GET /api/partner/billing": () => (synced ? growth : free),
      "GET /api/partner/billing/checkout": () => ({ requestId: "request-1", tier: "growth", billingInterval: "monthly", status: "ready", checkoutUrl: "https://polar.example.test/co_1", synced }),
    });
    expect(await screen.findByText("billing.checkout.confirming")).toBeTruthy();
    expect(fixture.telemetry!.events).toEqual([]);
    synced = true;
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("billing.checkout.done:billing.tiers.growth"), { timeout: 4_000 });
    expect(fixture.replace).toHaveBeenCalledWith("/partner/partner/billing");
    fixture.telemetry!.expectEvent("web.partner.tier_started", { partnerId: "partner", tier: "growth", billingInterval: "monthly", pathname: "/partner/partner/billing" });
    expect(fixture.telemetry!.events.filter((event) => event.name === "web.partner.tier_started")).toHaveLength(1);
  });

  it("shows this month's pool use against the pool, rounding a started minute up", async () => {
    renderWith({ "GET /api/partner/billing": () => ({ ...growth, poolUsage: { periodKey: "2026-10", voiceSecondsUsed: 12_030, chatsUsed: 4_100, overageSpendCents: 0 } }) });
    const pool = await screen.findByRole("region", { name: "billing.pool.title" });
    expect(pool.textContent).toContain("201 / 1,300");
    expect(pool.textContent).toContain("4,100 / 5,000");
  });

  it("shows this month's use of the pool the host set where the dashboard sells no tier, with no tier, price or overage", async () => {
    // The host limited minutes to 500 and left chats with no limit.
    const hostPool = { ...free, billed: false, pool: { voiceSeconds: 30_000, chats: null }, poolUsage: { periodKey: "2026-10", voiceSecondsUsed: 12_030, chatsUsed: 4_100, overageSpendCents: 0 }, numbersCounted: false, trialNumber: null };
    renderWith({ "GET /api/partner/billing": () => hostPool });
    const pool = await screen.findByRole("region", { name: "billing.pool.title" });
    expect(pool.textContent).toContain("201 / 500");
    expect(pool.textContent).toContain("billing.pool.noLimit");
    expect(pool.querySelectorAll(".bg-secondary")).toHaveLength(1);
    // The page has no subtitle under its title.
    expect(screen.queryByText("billing.hostPool.description")).toBeNull();
    expect(screen.getByText("billing.hostPool.limit")).toBeTruthy();
    for (const hidden of ["billing.description", "billing.unavailable", "billing.current.title", "billing.current.free", "billing.overage.title", "billing.choose.title"]) expect(screen.queryByText(hidden)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.body.textContent).not.toContain("$");
  });

  it("explains that Free has no overage, with nothing to change", async () => {
    renderWith({ "GET /api/partner/billing": () => free });
    expect(await screen.findByText("billing.overage.free")).toBeTruthy();
    // What overage does past the pool would contradict that.
    expect(screen.queryByText("billing.overage.description")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByLabelText("billing.overage.capLabel")).toBeNull();
  });

  it("lets the owner cap a paid tier's overage, remove the cap, and turn overage off", async () => {
    let overage = { enabled: true, capCents: null as number | null, billed: true };
    const saved: unknown[] = [];
    renderWith({
      "GET /api/partner/billing": () => ({ ...growth, poolUsage: { ...growth.poolUsage, overageSpendCents: 1_250 }, poolOverage: overage }),
      "POST /api/partner/billing/overage": (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { enabled: boolean; capCents: number | null };
        saved.push(body);
        overage = { ...overage, enabled: body.enabled, capCents: body.capCents };
        return overage;
      },
    });
    expect(await screen.findByText("billing.overage.noCap")).toBeTruthy();
    expect(screen.getByText("billing.overage.description")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("billing.overage.capLabel"), "abc");
    await userEvent.click(screen.getByRole("button", { name: "billing.overage.saveCap" }));
    expect(toast.error).toHaveBeenCalledWith("billing.overage.invalidAmount");
    await userEvent.clear(screen.getByLabelText("billing.overage.capLabel"));
    await userEvent.type(screen.getByLabelText("billing.overage.capLabel"), "50.00");
    await userEvent.click(screen.getByRole("button", { name: "billing.overage.saveCap" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("billing.overage.capSaved"));
    expect(await screen.findByText("billing.overage.spendOfCap")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "billing.overage.removeCap" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("billing.overage.capRemoved"));
    await userEvent.click(await screen.findByRole("switch", { name: "billing.overage.toggle" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("billing.overage.turnedOff"));
    expect(await screen.findByText("billing.overage.off")).toBeTruthy();
    expect(saved).toEqual([
      { partnerId: "partner", enabled: true, capCents: 5_000 },
      { partnerId: "partner", enabled: true, capCents: null },
      { partnerId: "partner", enabled: false, capCents: null },
    ]);
  });

  it("says when overage reached the cap", async () => {
    renderWith({ "GET /api/partner/billing": () => ({ ...growth, poolUsage: { ...growth.poolUsage, overageSpendCents: 5_000 }, poolOverage: { enabled: true, capCents: 5_000, billed: true } }) });
    expect(await screen.findByText("billing.overage.capReached")).toBeTruthy();
  });
});
