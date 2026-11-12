// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planEntitlement, type BillingPlanSlug } from "@lobbystack/shared";
import { LivePhoneNumberSettingsSurface } from "./live-phone-number-settings-surface";

const actions = vi.hoisted(() => ({ upgrade: vi.fn() }));
vi.mock("./upgrade-plan-dialog-context", () => ({ useOpenUpgradePlanDialog: () => actions.upgrade }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: Record<string, unknown>) => options?.price ? `${key}:${String(options.price)}` : key }) }));

const DEFAULT_AGENT = "agent-default";
const SECOND_AGENT = "agent-after-hours";
const clients: QueryClient[] = [];
beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() }); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup(input: { plan: string; extraNumbers: { available: boolean; priced: boolean; subscribed?: boolean; checkoutAvailable?: boolean; refusal: string | null }; numbers?: Array<Record<string, unknown>>; returning?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  const cached = input.numbers ?? [{ id: "included", e164: "+14165550100", agentId: DEFAULT_AGENT, status: "active", reclaimScheduledAt: null, monthlyPriceCents: null }];
  const returning = input.returning;
  client.setQueryData(["phone-numbers", "business"], { phoneNumbers: cached, replacement: { usedAt: null, activeClaim: null }, extraNumbers: input.extraNumbers, extraClaim: null });
  client.setQueryData(["billing", "business"], { effectivePlan: input.plan, entitlement: planEntitlement(input.plan as BillingPlanSlug, { live: input.plan !== "free_cloud", capMinor: null }), account: { plan: input.plan } });
  const fetchMock = vi.fn(async (input: string, _init?: RequestInit) => {
    if (input.includes("/extra/claim/claim?")) return Response.json({ claim: { status: "claimed", phoneNumberId: "extra-phone", requestedE164: "+14165550200" } });
    if (input.includes("/extra/claim?")) return Response.json({ claimId: "claim" }, { status: 202 });
    if (input.includes("/extra/search?")) return Response.json({ market: { countryCode: "CA" }, price: { countryCode: "CA", monthlyCents: 115, currency: "USD" }, numbers: [0, 1, 2].map((index) => ({ phoneE164: `+141655502${String(index).padStart(2, "0")}`, countryCode: "CA", claimToken: `offer-${index}`, capabilities: { voice: true, sms: true } })) });
    if (input.startsWith("/api/billing/extra-numbers/checkout?")) return Response.json({ id: "checkout", status: "ready", checkoutUrl: "https://polar.test/checkout", error: null, subscribed: Boolean(returning) });
    if (input.startsWith("/api/billing/extra-numbers/checkout")) return Response.json({ requestId: "checkout" }, { status: 202 });
    if (input.includes("/api/phone-numbers?")) return Response.json({ phoneNumbers: returning ? cached : [], replacement: { usedAt: null }, extraNumbers: { available: true, priced: true, subscribed: true, checkoutAvailable: true, refusal: null } });
    throw new Error(`Unexpected request: ${input}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LivePhoneNumberSettingsSurface agentId={SECOND_AGENT} /></QueryClientProvider>);
  return { fetchMock };
}

describe("buying an extra number for an agent", () => {
  it("shows the country's price, asks before buying, and buys the number for this agent", async () => {
    const { fetchMock } = setup({ plan: "starter", extraNumbers: { available: true, priced: true, subscribed: true, refusal: null } });
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.extra.buy" }));
    expect(await screen.findByText("phoneNumber.extra.monthly:$1.15")).toBeTruthy();
    const buy = await screen.findAllByRole("button", { name: "phoneNumber.extra.select" });
    await userEvent.click(buy[0]!);
    expect(await screen.findByText("phoneNumber.extra.confirmDescription:$1.15")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/extra/claim?"))).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.extra.confirm" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("/extra/claim/claim?"))).toBe(true));
    const claim = fetchMock.mock.calls.find(([url]) => url.includes("/extra/claim?"));
    expect(JSON.parse(String((claim?.[1] as RequestInit | undefined)?.body))).toMatchObject({ claimToken: "offer-0", agentId: SECOND_AGENT });
  });

  it("buys nothing when the operator cancels", async () => {
    const { fetchMock } = setup({ plan: "pro", extraNumbers: { available: true, priced: true, subscribed: true, refusal: null } });
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.extra.buy" }));
    const buy = await screen.findAllByRole("button", { name: "phoneNumber.extra.select" });
    await userEvent.click(buy[0]!);
    await userEvent.click(await screen.findByRole("button", { name: "phoneNumber.extra.cancel" }));
    await waitFor(() => expect(screen.queryByText("phoneNumber.extra.confirmDescription:$1.15")).toBeNull());
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/extra/claim?"))).toBe(false);
  });

  it("sends Buy a number through the add-on's checkout before the first extra number, with no billing copy on the page", async () => {
    const { fetchMock } = setup({ plan: "starter", extraNumbers: { available: true, priced: true, subscribed: false, checkoutAvailable: true, refusal: null } });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, search: "" });
    expect(screen.getByText("phoneNumber.current.empty")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.extra.buy" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://polar.test/checkout"));
    const start = fetchMock.mock.calls.find(([url, init]) => url.startsWith("/api/billing/extra-numbers/checkout") && init?.method === "POST");
    expect(JSON.parse(String(start?.[1]?.body))).toMatchObject({ businessId: "business", agentId: SECOND_AGENT });
  });

  it("opens the number picker once Polar confirms the add-on after checkout", async () => {
    window.history.replaceState(null, "", "/agents/agent-after-hours/channels/phone?extraNumbersCheckout=checkout");
    try {
      setup({ plan: "starter", returning: true, extraNumbers: { available: true, priced: true, subscribed: false, checkoutAvailable: true, refusal: null } });
      expect(await screen.findByRole("dialog")).toBeTruthy();
      expect(window.location.search).toBe("");
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("says the workspace can't buy more numbers when the deployment doesn't sell the add-on", () => {
    setup({ plan: "pro", extraNumbers: { available: true, priced: true, subscribed: false, checkoutAvailable: false, refusal: null } });
    expect(screen.getByText("phoneNumber.extra.unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "phoneNumber.extra.buy" })).toBeNull();
  });

  it("offers the plans on Free", async () => {
    setup({ plan: "free_cloud", extraNumbers: { available: false, priced: false, refusal: "dedicated_number_requires_paid_plan" } });
    await userEvent.click(await screen.findByRole("button", { name: "phoneNumber.requiresPaidPlan.upgradeCta" }));
    expect(actions.upgrade).toHaveBeenCalledOnce();
  });

  it("shows an extra number's monthly price", () => {
    setup({ plan: "starter", extraNumbers: { available: true, priced: true, subscribed: true, refusal: null }, numbers: [
      { id: "included", e164: "+14165550100", agentId: DEFAULT_AGENT, status: "active", reclaimScheduledAt: null, monthlyPriceCents: null },
      { id: "extra", e164: "+14165550101", agentId: SECOND_AGENT, status: "active", reclaimScheduledAt: null, monthlyPriceCents: 115 },
    ] });
    expect(screen.getByText("phoneNumber.extra.monthly:$1.15")).toBeTruthy();
  });
});
