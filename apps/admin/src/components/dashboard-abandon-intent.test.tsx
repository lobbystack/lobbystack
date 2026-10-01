// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardAbandonIntent } from "./dashboard-abandon-intent";
import { LiveUpgradePlanProvider } from "./live-upgrade-plan-provider";
import { useOpenUpgradePlanDialog } from "./upgrade-plan-dialog-context";
import { announceTestCallEnded, setTestCallActive } from "@/lib/test-call-launcher";
import { ABANDON_INTENT_CALL_GRACE_MS, ABANDON_INTENT_IDLE_MS, ABANDON_INTENT_MIN_DWELL_MS } from "@/lib/abandon-intent";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
import { setUpgradeInProgress } from "@/lib/upgrade-in-progress";

const survey = vi.hoisted(() => ({ shown: vi.fn(), dismissed: vi.fn(), response: vi.fn(() => true) }));
vi.mock("@/lib/abandon-intent-survey", () => ({
  captureSurveyShown: survey.shown,
  captureSurveyDismissed: survey.dismissed,
  captureSurveyResponse: survey.response,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));

let store: Record<string, string>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  telemetryRef.current = createRecordedBrowserTelemetry();
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: fine)", media: query, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function setup() {
  render(<DashboardAbandonIntent businessId="business" />);
  await vi.advanceTimersByTimeAsync(0);
}

function leaveThroughTop() {
  document.dispatchEvent(new MouseEvent("mouseout", { clientY: 0, relatedTarget: null, bubbles: true }));
}

describe("abandon intent reporting", () => {
  it("opens the dialog and records the survey as shown", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    leaveThroughTop();
    expect(survey.shown).toHaveBeenCalledOnce();
    expect(await screen.findByText("abandonIntent.title")).toBeTruthy();
  });

  it("sends both answers and shows the confirmation", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    leaveThroughTop();
    await screen.findByText("abandonIntent.title");
    fireEvent.change(screen.getByLabelText("abandonIntent.issue.label"), { target: { value: "Test call failed" } });
    fireEvent.click(screen.getByRole("button", { name: "abandonIntent.submit" }));
    expect(survey.response).toHaveBeenCalledWith({ issue: "Test call failed", missing: "" });
    expect(await screen.findByText("abandonIntent.sentTitle")).toBeTruthy();
    expect(survey.dismissed).not.toHaveBeenCalled();
  });

  it("records a dismissal when the dialog is closed untouched", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    leaveThroughTop();
    await screen.findByText("abandonIntent.title");
    fireEvent.click(screen.getByRole("button", { name: "abandonIntent.notNow" }));
    expect(survey.dismissed).toHaveBeenCalledOnce();
    expect(survey.response).not.toHaveBeenCalled();
  });

  it("keeps the submit button disabled until something is written", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    leaveThroughTop();
    await screen.findByText("abandonIntent.title");
    expect(screen.getByRole("button", { name: "abandonIntent.submit" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("abandonIntent.missing.label"), { target: { value: "Hours editor" } });
    expect(screen.getByRole("button", { name: "abandonIntent.submit" }).hasAttribute("disabled")).toBe(false);
  });

  it("reports the operator leaving", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    leaveThroughTop();
    telemetryRef.current!.expectEvent("web.activation.abandon_intent", { businessId: "business", trigger: "exit_intent" });
  });

  it("reports a dashboard left open and untouched", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_IDLE_MS);
    telemetryRef.current!.expectEvent("web.activation.abandon_intent", { businessId: "business", trigger: "idle" });
  });

  it("still reports an operator who has already heard a call", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    announceTestCallEnded();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_CALL_GRACE_MS);
    leaveThroughTop();
    telemetryRef.current!.expectEvent("web.activation.abandon_intent", { businessId: "business", trigger: "exit_intent" });
  });

  it("stays quiet while the page has only just opened", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS / 2);
    leaveThroughTop();
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("leaves the moment after a finished call to the upgrade prompt", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    announceTestCallEnded();
    leaveThroughTop();
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("reports once per session however often the pointer leaves", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    leaveThroughTop();
    leaveThroughTop();
    leaveThroughTop();
    expect(telemetryRef.current!.events.filter(event => event.name === "web.activation.abandon_intent")).toHaveLength(1);
  });

  it("ignores the pointer crossing between elements", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    document.dispatchEvent(new MouseEvent("mouseout", { clientY: 120, relatedTarget: document.body, bubbles: true }));
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("does not interrupt an operator who is still working the page", async () => {
    await setup();
    // Three minutes of steady work: the timer has to start over each time.
    for (let elapsed = 0; elapsed < ABANDON_INTENT_IDLE_MS * 2; elapsed += ABANDON_INTENT_IDLE_MS / 2) {
      await vi.advanceTimersByTimeAsync(ABANDON_INTENT_IDLE_MS / 2);
      document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    }
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("asks once the operator has gone quiet for long enough", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_IDLE_MS / 2);
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_IDLE_MS);
    telemetryRef.current!.expectEvent("web.activation.abandon_intent", { businessId: "business", trigger: "idle" });
  });

  it("stays out of the way of a call still in progress", async () => {
    await setup();
    setTestCallActive(true);
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_IDLE_MS);
    leaveThroughTop();
    expect(telemetryRef.current!.events).toHaveLength(0);
    setTestCallActive(false);
  });

  it("stays out of the way while someone is upgrading", async () => {
    await setup();
    setUpgradeInProgress(true);
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_IDLE_MS);
    leaveThroughTop();
    expect(survey.shown).not.toHaveBeenCalled();
    expect(telemetryRef.current!.events).toHaveLength(0);
    setUpgradeInProgress(false);
  });

  it("stays quiet on a touch device", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_IDLE_MS);
    leaveThroughTop();
    expect(telemetryRef.current!.events).toHaveLength(0);
  });
});

describe("abandon intent during an upgrade", () => {
  const clients: QueryClient[] = [];
  afterEach(() => { clients.forEach(client => client.clear()); clients.length = 0; });

  function OpenPlans() {
    const open = useOpenUpgradePlanDialog();
    return <button onClick={open} type="button">Open plans</button>;
  }

  async function renderDashboard(checkout: (url: string, init?: RequestInit) => Promise<Response>) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
    client.setQueryData(["billing", "business"], { account: { plan: "free_cloud" }, availableCheckoutPlans: ["starter", "pro"], availableCheckoutIntervals: { starter: ["annual"], pro: ["annual"] } });
    vi.stubGlobal("fetch", vi.fn(checkout));
    render(
      <QueryClientProvider client={client}>
        <LiveUpgradePlanProvider>
          <OpenPlans />
          <DashboardAbandonIntent businessId="business" />
        </LiveUpgradePlanProvider>
      </QueryClientProvider>,
    );
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    fireEvent.click(screen.getByRole("button", { name: "Open plans" }));
    await screen.findByRole("button", { name: "billing.upgradeDialog.actions.pro" });
  }

  function expectNoSurvey() {
    expect(survey.shown).not.toHaveBeenCalled();
    expect(screen.queryByText("abandonIntent.title")).toBeNull();
    expect(telemetryRef.current!.events.filter(event => event.name === "web.activation.abandon_intent")).toHaveLength(0);
  }

  it("stays quiet while the plan picker is open, through checkout, and on the way out to it", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    let status = "pending";
    await renderDashboard(async (url, init) => init?.method === "POST"
      ? Response.json({ requestId: "request" })
      : Response.json({ status, checkoutUrl: status === "ready" ? "https://checkout.example/session" : null, error: null }));

    leaveThroughTop();
    expectNoSurvey();

    fireEvent.click(screen.getByRole("button", { name: "billing.upgradeDialog.actions.pro" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("requestId=request"), expect.anything()));
    leaveThroughTop();
    expectNoSurvey();

    status = "ready";
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.example/session"));
    leaveThroughTop();
    expectNoSurvey();
  });

  it("asks again once a failed checkout is behind them and the picker is closed", async () => {
    await renderDashboard(async () => Response.json({ error: "Checkout unavailable" }, { status: 503 }));
    fireEvent.click(screen.getByRole("button", { name: "billing.upgradeDialog.actions.pro" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "billing.upgradeDialog.actions.pro" }).hasAttribute("disabled")).toBe(false));
    leaveThroughTop();
    expectNoSurvey();

    fireEvent.click(screen.getByRole("button", { name: "accessibility.close" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "billing.upgradeDialog.actions.pro" })).toBeNull());
    leaveThroughTop();
    expect(survey.shown).toHaveBeenCalledOnce();
    telemetryRef.current!.expectEvent("web.activation.abandon_intent", { businessId: "business", trigger: "exit_intent" });
  });
});
