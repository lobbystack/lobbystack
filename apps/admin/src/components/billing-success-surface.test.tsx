// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingSuccessSurface } from "./billing-success-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const route = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn() }, search: new URLSearchParams() }));
const locale = vi.hoisted(() => ({ language: "en" }));
const translate = vi.hoisted(() => vi.fn((key: string) => key));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("next/navigation", () => ({ useRouter: () => route.router, useSearchParams: () => route.search }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate, i18n: { language: locale.language, resolvedLanguage: locale.language } }) }));

const clients: QueryClient[] = [];
beforeEach(() => {
  route.search = new URLSearchParams("requestId=checkout-1");
  locale.language = "en";
  telemetryRef.current = createRecordedBrowserTelemetry();
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; localStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup({ synced = true, stage = "plan", number = null as string | null } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, onboardingStage: stage }] });
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.startsWith("/api/billing/checkout?")) return Response.json({ synced, target: "starter" });
    if (url.startsWith("/api/phone-numbers?")) return Response.json({ phoneNumbers: number ? [{ e164: number, reclaimScheduledAt: null }] : [] });
    if (url.startsWith("/api/onboarding/stage?")) return Response.json({ ok: true, stage: "phone_number" });
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<StrictMode><QueryClientProvider client={client}><BillingSuccessSurface /></QueryClientProvider></StrictMode>);
  return fetchMock;
}

const stageRequests = (fetchMock: ReturnType<typeof setup>) => fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/onboarding/stage?"));

describe("billing success page", () => {
  it("confirms the payment while the plan syncs, with nothing to click", async () => {
    const fetchMock = setup({ synced: false });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/checkout?businessId=business&requestId=checkout-1", expect.anything()));
    expect(screen.getByRole("heading", { name: "billing.success.received.title" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("billing.success.received.status");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(stageRequests(fetchMock)).toHaveLength(0);
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("shows the plan, opens the number step once, and reports the checkout once", async () => {
    const fetchMock = setup();
    expect(await screen.findByRole("heading", { name: "billing.success.title" })).toBeTruthy();
    expect(translate).toHaveBeenCalledWith("billing.success.title", { plan: "billing.planLabels.starter" });
    expect(translate).toHaveBeenCalledWith("billing.success.unlocks.voiceMinutes", { count: 150 });
    expect(translate).toHaveBeenCalledWith("billing.success.unlocks.numbers", { count: 1 });
    expect(translate).toHaveBeenCalledWith("billing.success.unlocks.alertSms", { count: 50 });
    expect(translate).toHaveBeenCalledWith("billing.success.unlocks.transfers", { count: 20 });
    await waitFor(() => expect(stageRequests(fetchMock)).toHaveLength(1));
    expect(stageRequests(fetchMock)[0]![1]).toEqual(expect.objectContaining({ method: "POST", body: JSON.stringify({ to: "phone_number" }) }));
    telemetryRef.current!.expectEvent("web.onboarding.plan_checkout_completed", { businessId: "business", plan: "starter" });
    expect(telemetryRef.current!.events.filter(event => event.name === "web.onboarding.plan_checkout_completed")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "billing.success.number.choose" }));
    await waitFor(() => expect(route.router.push).toHaveBeenCalledWith("/onboarding/number"));
    expect(stageRequests(fetchMock)).toHaveLength(1);
  });

  it("lists the steps, holding back the AI settings link until onboarding is done", async () => {
    setup();
    await screen.findByRole("heading", { name: "billing.success.title" });
    const steps = within(screen.getAllByRole("list").at(-1)!);
    expect(steps.getAllByRole("listitem")).toHaveLength(3);
    // No number to call yet, and the dashboard would send them back to onboarding.
    expect(steps.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["https://docs.lobbystack.com/getting-started/claim-your-number#using-your-existing-business-number"]);
  });

  it("does not report the same checkout again when the page is reloaded", async () => {
    setup();
    await waitFor(() => expect(telemetryRef.current!.events).toHaveLength(1));
    cleanup();
    setup();
    expect(await screen.findByRole("heading", { name: "billing.success.title" })).toBeTruthy();
    expect(telemetryRef.current!.events).toHaveLength(1);
  });

  it("shows a trial number the payment converted once the plan syncs", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, onboardingStage: "complete" }] });
    // The first poll finds the payment unsynced; the second finds it synced, which converts the trial.
    let polls = 0;
    let synced = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.startsWith("/api/billing/checkout?")) { polls += 1; synced = polls > 1; return Response.json({ synced, target: "starter" }); }
      // Until the payment syncs, the trial number still has its release date.
      if (url.startsWith("/api/phone-numbers?")) return Response.json({ phoneNumbers: [{ e164: "+14165550123", reclaimScheduledAt: synced ? null : "2026-11-08T00:00:00.000Z" }] });
      throw new Error(`Unexpected request ${url}`);
    }));
    render(<StrictMode><QueryClientProvider client={client}><BillingSuccessSurface /></QueryClientProvider></StrictMode>);
    expect(await screen.findByRole("link", { name: "(416) 555-0123" }, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "billing.success.number.choose" })).toBeNull();
  });

  it("gives a settings checkout with a number the number and every next step", async () => {
    const fetchMock = setup({ stage: "complete", number: "+14165550123" });
    expect(await screen.findByText("billing.success.number.keep")).toBeTruthy();
    const call = await screen.findByRole("link", { name: "(416) 555-0123" });
    expect(call.getAttribute("href")).toBe("tel:+14165550123");
    expect(screen.getByRole("link", { name: "billing.success.steps.transfer.action" }).getAttribute("href")).toBe("/agent#agent-transfer-number");
    expect(screen.getByRole("button", { name: "billing.success.dashboard" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("button", { name: "billing.success.number.choose" })).toBeNull();
    expect(stageRequests(fetchMock)).toHaveLength(0);
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("sends a settings checkout without a number to the settings number page", async () => {
    setup({ stage: "complete" });
    await userEvent.click(await screen.findByRole("button", { name: "billing.success.number.choose" }));
    expect(route.router.push).toHaveBeenCalledWith("/settings/phone-number");
  });

  it("links French readers to the French forwarding guide", async () => {
    locale.language = "fr";
    setup({ stage: "complete" });
    expect((await screen.findByRole("link", { name: "billing.success.steps.forward.action" })).getAttribute("href")).toBe("https://docs.lobbystack.com/fr/getting-started/claim-your-number");
  });

  it("points a visit without a checkout to the plan page", () => {
    route.search = new URLSearchParams();
    setup();
    expect(screen.getByRole("heading", { name: "billing.success.missing.title" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "billing.success.missing.action" }).getAttribute("href")).toBe("/settings/plan");
  });
});
