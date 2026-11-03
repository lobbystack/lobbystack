// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
import { announceTestChatReplied, setTestCallActive } from "@/lib/test-window";
import { LiveUpgradePlanProvider } from "./live-upgrade-plan-provider";
import { PlanOfferMoment } from "./plan-offer-moment";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));

const billing = { account: { plan: "free_cloud", billingInterval: null, subscriptionState: null }, availableCheckoutPlans: ["starter", "pro"], availableCheckoutIntervals: { starter: ["monthly"], pro: ["monthly"] } };

let businessId: string;
let sequence = 0;

function setup(due: () => boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId, active: true }] });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/plan-offer")) return Response.json(init?.method === "POST" ? { ok: true } : { due: due() });
    if (url.startsWith("/api/billing/checkout")) return Response.json({ requestId: "request" });
    if (url.startsWith("/api/billing")) return Response.json(billing);
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  const view = render(<QueryClientProvider client={client}><LiveUpgradePlanProvider><PlanOfferMoment businessId={businessId} surface="meet" /></LiveUpgradePlanProvider></QueryClientProvider>);
  return { fetchMock, view };
}

// Each test is a new business, because the session guard outlives a render.
beforeEach(() => {
  sequence += 1;
  businessId = `business-${sequence}`;
  telemetryRef.current = createRecordedBrowserTelemetry();
});
afterEach(() => { cleanup(); setTestCallActive(false); vi.unstubAllGlobals(); });

const planDialog = () => screen.findByRole("dialog");
const closeButton = () => screen.findByRole("button", { name: "accessibility.close" });

describe("the plans offer", () => {
  it("opens once a test has completed, and reports showing", async () => {
    const { fetchMock } = setup(() => true);
    await planDialog();
    telemetryRef.current!.expectEvent("web.onboarding.plan_offer_shown", { businessId, surface: "meet" });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.startsWith("/api/plan-offer") && init?.method === "POST")).toBe(true));
  });

  it("stays shut before any test completes", async () => {
    const { fetchMock } = setup(() => false);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(telemetryRef.current!.events).toEqual([]);
  });

  it("opens after a test chat's reply reaches the server", async () => {
    let answered = false;
    setup(() => answered);
    await act(async () => { await Promise.resolve(); });
    answered = true;
    act(() => announceTestChatReplied());
    await screen.findByRole("dialog", {}, { timeout: 4_000 });
  });

  it("waits for a running call to end", async () => {
    setTestCallActive(true);
    const { fetchMock } = setup(() => true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(telemetryRef.current!.events).toEqual([]);
  });

  it("reports the X and closes", async () => {
    setup(() => true);
    await userEvent.click(await closeButton());
    telemetryRef.current!.expectEvent("web.onboarding.plan_offer_dismissed", { businessId, surface: "meet" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("reports a plan clicked, and not a dismissal", async () => {
    setup(() => true);
    await planDialog();
    await userEvent.click(screen.getAllByRole("button").find((button) => button.closest("section")?.querySelector("h3") && !(button as HTMLButtonElement).disabled && button.closest("section")?.getAttribute("data-selected") === "true")!);
    await waitFor(() => expect(telemetryRef.current!.events.some((event) => event.name === "web.onboarding.plan_offer_clicked")).toBe(true));
    expect(telemetryRef.current!.events.some((event) => event.name === "web.onboarding.plan_offer_dismissed")).toBe(false);
  });

  it("never opens twice in one session", async () => {
    const first = setup(() => true);
    await userEvent.click(await closeButton());
    first.view.unmount();
    telemetryRef.current = createRecordedBrowserTelemetry();
    const { fetchMock } = setup(() => true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(telemetryRef.current!.events).toEqual([]);
  });
});
