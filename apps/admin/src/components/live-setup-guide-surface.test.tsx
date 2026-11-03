// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import commonEn from "../../public/locales/en/common.json";
import en from "../../public/locales/en/dashboard.json";
import knowledgeEn from "../../public/locales/en/knowledge.json";
import settingsEn from "../../public/locales/en/settings.json";
import type { Capability } from "@lobbystack/domain";
import { ALL_CAPABILITIES, BusinessCapabilitiesProvider } from "./business-capabilities-provider";
import { LiveOverviewSurface } from "./live-overview-surface";
import { UpgradePlanDialogProvider } from "./upgrade-plan-dialog-context";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
import { announceTestCallEnded, registerTestWindow } from "@/lib/test-window";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));

const copy = en.setupGuide;
const order = ["fullScan", "sources", "testCall", "phoneNumber"] as const;
const goals = ["answer_calls", "book_appointments", "answer_website_visitors", "answer_instagram_messages", null] as const;
const clients: QueryClient[] = [];
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

const summary = (firstRealConversationAt: string | null) => ({ businessId: "business", kpis: { calls: { total: 0, deltaPercent: 0 }, appointments: { total: 0, deltaPercent: 0 }, averageDuration: { totalSeconds: 0, deltaSeconds: 0 } }, monthlyCalls: [], recentCalls: [], actionRequired: [], upcoming: [], firstRealConversationAt });
type Setup = { firstRealConversationAt?: string | null; role?: string; capabilities?: Capability[]; goal?: string | null; activation?: Record<string, unknown>; numbers?: unknown[]; trial?: Record<string, unknown>; includedNumbers?: number | null; partnerNumbers?: Record<string, unknown> | null; complete?: string[]; skipped?: string[]; setupDown?: boolean };

async function setup({ activation = {}, capabilities, complete = [], firstRealConversationAt = null, goal = null, includedNumbers = 0, numbers = [], partnerNumbers = null, role = "business_owner", setupDown = false, skipped = [], trial = { status: "none" } }: Setup = {}) {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
  const skips = new Set(skipped);
  const steps = () => order.map((id) => ({ id, documentId: id === "fullScan" ? "doc_1" : null, status: complete.includes(id) ? "complete" : skips.has(id) ? "skipped" : "needs setup" }));
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/setup") && init?.method === "PATCH") { skips.add(JSON.parse(String(init.body)).stepId); return Response.json({ skippedSteps: [...skips] }); }
    if (url.startsWith("/api/setup") && setupDown) return Response.json({ error: "Down." }, { status: 500 });
    if (url.startsWith("/api/setup")) return Response.json({ steps: steps(), skippedSteps: [...skips] });
    if (url.startsWith("/api/activation")) return Response.json({ deploymentMode: "cloud", plan: "free_cloud", paidPlanLive: false, hasDedicatedNumber: numbers.length > 0, completedWebCalls: 0, lastTestCall: null, country: "CA", widgetsEnabled: true, websiteImport: null, ...activation });
    if (url.startsWith("/api/phone-numbers")) return Response.json({ phoneNumbers: numbers, activeClaim: null, replacement: { usedAt: null, activeClaim: null }, partnerNumbers });
    if (url.startsWith("/api/billing")) return Response.json({ entitlement: { includedNumbers } });
    if (url.startsWith("/api/number-trial")) return Response.json({ trial });
    if (url.startsWith("/api/knowledge/")) return Response.json({});
    return Response.json({ error: "Not found." }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const i18n = createInstance();
  await i18n.init({ lng: "en", defaultNS: "dashboard", resources: { en: { dashboard: en, common: commonEn, knowledge: knowledgeEn, settings: settingsEn } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["dashboard"], summary(firstRealConversationAt));
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Clinic", slug: "clinic", role, active: true, onboardingGoal: goal, ...(capabilities ? { capabilities } : {}) }] });
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><BusinessCapabilitiesProvider initial={ALL_CAPABILITIES}><UpgradePlanDialogProvider onOpen={vi.fn()}><LiveOverviewSurface /></UpgradePlanDialogProvider></BusinessCapabilitiesProvider></QueryClientProvider></I18nextProvider>);
  return { client, fetchMock };
}

const apiCalls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(([url]) => String(url));
const skipRequests = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH").map(([, init]) => JSON.parse(String(init.body)).stepId);
const list = () => screen.findByRole("heading", { name: copy.title });
const number = { id: "n", e164: "+15145550100", status: "active", reclaimScheduledAt: null };

describe("the list on Home", () => {
  it("sits above the daily view, under a single page title", async () => {
    await setup();
    await list();
    expect(screen.getByRole("heading", { level: 1, name: en.home.title })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("0 of 4 setup steps complete.")).toBeTruthy();
    expect(screen.getByText(en.home.actionRequired.title)).toBeTruthy();
  });

  // Going live doesn't hide what's left to set up.
  it("stays after the first real conversation", async () => {
    const { client } = await setup();
    await list();
    act(() => client.setQueryData(["dashboard"], summary("2026-11-01T12:00:00.000Z")));
    await act(async () => { await client.invalidateQueries({ queryKey: ["setup"] }); });
    expect(await list()).toBeTruthy();
  });

  it("shows the list to a business with a real conversation and unfinished steps", async () => {
    await setup({ firstRealConversationAt: "2026-11-01T12:00:00.000Z" });
    expect(await list()).toBeTruthy();
    expect(screen.getByText(en.home.actionRequired.title)).toBeTruthy();
  });

  it("stays after every step gets done without a skip", async () => {
    await setup({ complete: [...order], numbers: [number] });
    await list();
    expect(screen.getByText(en.home.actionRequired.title)).toBeTruthy();
  });

  it("falls back to the normal Home when setup can't load", async () => {
    await setup({ setupDown: true });
    expect(await screen.findByText(en.home.actionRequired.title)).toBeTruthy();
  });
});

describe("Skip setup", () => {
  it("skips every step and shows the normal Home, with no redirect", async () => {
    const { fetchMock } = await setup({ complete: ["fullScan"] });
    await userEvent.click(await screen.findByRole("button", { name: copy.skip }));
    expect(await screen.findByText(en.home.actionRequired.title)).toBeTruthy();
    expect(skipRequests(fetchMock)).toEqual([...order]);
    expect(screen.queryByRole("heading", { name: copy.title })).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("works for someone with every step done, whose number step is still open", async () => {
    const { fetchMock } = await setup({ complete: [...order], numbers: [number] });
    await userEvent.click(await screen.findByRole("button", { name: copy.skip }));
    expect(await screen.findByText(en.home.actionRequired.title)).toBeTruthy();
    expect(skipRequests(fetchMock)).toEqual([...order]);
  });

  it("keeps the normal Home on the next visit", async () => {
    await setup({ skipped: [...order] });
    expect(await screen.findByText(en.home.actionRequired.title)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: copy.title })).toBeNull();
  });
});

describe("people who can't act on the steps", () => {
  it.each([
    ["an owner of an activity-only business", { role: "business_owner", capabilities: ["activity"] as Capability[] }],
    ["an admin of an activity-only business", { role: "business_admin", capabilities: ["activity"] as Capability[] }],
    ["a viewer", { role: "viewer" }],
    ["a scheduler", { role: "scheduler" }],
  ])("keeps the normal Home for %s, with no setup requests", async (_who, access) => {
    const { fetchMock } = await setup(access);
    expect(await screen.findByText(en.home.actionRequired.title)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: copy.title })).toBeNull();
    for (const url of apiCalls(fetchMock)) expect(url).not.toMatch(/^\/api\/(setup|phone-numbers)/);
  });
});

describe("steps", () => {
  it.each(goals)("keeps the test call after sources for the goal %s", async (goal) => {
    await setup({ goal });
    await list();
    const titles = screen.getAllByRole("button").map((button) => button.textContent ?? "");
    const positions = order.map((id) => titles.findIndex((title) => title.includes(copy.steps[id])));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it.each(goals)("words the steps for the goal %s", async (goal) => {
    await setup({ goal, complete: ["fullScan"] });
    expect(await screen.findByText(copy.stepDescriptions.sources[goal ?? "none"])).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: new RegExp(copy.steps.testCall) }));
    expect(await screen.findByText(copy.stepDescriptions.testCall[goal ?? "none"])).toBeTruthy();
  });

  it("opens the first step still needing setup", async () => {
    await setup({ complete: ["fullScan"], skipped: ["testCall"] });
    expect(await screen.findByRole("button", { name: copy.stepActions.sources })).toBeTruthy();
    expect(screen.getByText("2 of 4 setup steps complete.")).toBeTruthy();
  });

  it("persists skipping a step and moves to the next one", async () => {
    const { fetchMock } = await setup({ complete: ["fullScan"] });
    await screen.findByRole("button", { name: copy.stepActions.sources });
    await userEvent.click(screen.getByRole("button", { name: copy.skipStep }));
    await waitFor(() => expect(skipRequests(fetchMock)).toEqual(["sources"]));
    expect(await screen.findByText(copy.stepDescriptions.testCall.none)).toBeTruthy();
  });

  it.each(["complete", "skipped"])("keeps a %s step shut", async (status) => {
    await setup(status === "complete" ? { complete: ["fullScan"] } : { skipped: ["fullScan"] });
    await screen.findByRole("button", { name: copy.stepActions.sources });
    await userEvent.click(screen.getByRole("button", { name: new RegExp(copy.steps.fullScan) }));
    expect(screen.queryByRole("button", { name: copy.stepActions.fullScan })).toBeNull();
    expect(screen.getByRole("button", { name: copy.stepActions.sources })).toBeTruthy();
  });

  it("opens the upload page from the sources step", async () => {
    await setup({ complete: ["fullScan"] });
    await userEvent.click(await screen.findByRole("button", { name: copy.stepActions.sources }));
    expect(router.push).toHaveBeenCalledWith("/agent/knowledge?setup=upload");
  });

  it("asks for the deeper read", async () => {
    const { fetchMock } = await setup();
    await userEvent.click(await screen.findByRole("button", { name: copy.stepActions.fullScan }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/doc_1?businessId=business", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "expand" }) })));
  });

  it("shows a running import in the first step, with no second read to start", async () => {
    await setup({ activation: { websiteImport: { status: "crawling", websiteUrl: "https://clinic.example", importedCount: 2, indexedCount: 0 } } });
    await list();
    expect(await screen.findByText(/clinic\.example/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: copy.stepActions.fullScan })).toBeNull();
  });
});

describe("the test call step", () => {
  const heard = { activation: { completedWebCalls: 1, lastTestCall: { id: "call-1", startedAt: "2026-11-01T12:00:00.000Z", durationSeconds: 75 } } };

  it("opens the test window in place", async () => {
    const starter = vi.fn();
    const unregister = registerTestWindow(starter);
    await setup({ complete: ["fullScan", "sources"] });
    await userEvent.click(await screen.findByRole("button", { name: copy.stepActions.testCall }));
    expect(starter).toHaveBeenCalledOnce();
    expect(router.push).not.toHaveBeenCalled();
    unregister();
  });

  it("links the last test call to its transcript from a finished step", async () => {
    await setup({ ...heard, complete: ["fullScan", "sources", "testCall"] });
    await list();
    await userEvent.click(await screen.findByRole("button", { name: new RegExp(copy.steps.testCall) }));
    const link = await screen.findByRole("link", { name: new RegExp(copy.lastCall) });
    expect(link.getAttribute("href")).toBe("/calls/call-1");
  });

  it("rechecks the step once the call ends, since nothing navigates", async () => {
    const { fetchMock } = await setup({ complete: ["fullScan", "sources"] });
    await list();
    const before = apiCalls(fetchMock).filter((url) => url.startsWith("/api/setup")).length;
    act(() => announceTestCallEnded());
    await waitFor(() => expect(apiCalls(fetchMock).filter((url) => url.startsWith("/api/setup")).length).toBeGreaterThan(before), { timeout: 5_000 });
  });

  it("reports the first call, as the normal Home's card does", async () => {
    await setup({ activation: { completedWebCalls: 1 } });
    await waitFor(() => expect(telemetryRef.current!.events.map((event: { name: string }) => event.name)).toContain("web.activation.first_call_completed"));
  });
});

describe("the number step", () => {
  const before = { complete: ["fullScan", "sources", "testCall"] };

  it("offers a free business its trial number", async () => {
    await setup({ ...before, trial: { status: "available" } });
    expect(await screen.findByRole("button", { name: en.activation.freeTrial.cta })).toBeTruthy();
    expect(screen.getByText(copy.stepDescriptions.phoneNumberTrial)).toBeTruthy();
  });

  it("lets a plan with a number claim it here", async () => {
    await setup({ ...before, includedNumbers: 1 });
    expect(await screen.findByRole("button", { name: copy.stepActions.phoneNumber })).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("offers a plan when the trial is gone, and reports the prompt", async () => {
    await setup({ ...before, activation: { completedWebCalls: 1 }, trial: { status: "over" }, includedNumbers: 0 });
    await userEvent.click(await screen.findByRole("button", { name: en.activation.upgrade.cta }));
    const events = telemetryRef.current!.events.map((event: { name: string }) => event.name);
    expect(events).toContain("web.activation.upgrade_prompt_shown");
    expect(events).toContain("web.activation.upgrade_prompt_clicked");
  });

  it("follows the partner's tier", async () => {
    await setup({ ...before, partnerNumbers: { available: false, refusal: "partner_number_limit_reached" } });
    expect(await screen.findByText(settingsEn.phoneNumber.partnerTierRequired.description)).toBeTruthy();
  });

  it("stays open with forwarding steps once a number exists", async () => {
    await setup({ complete: [...order], numbers: [number] });
    expect(await screen.findByLabelText(en.forwarding.carrier.label)).toBeTruthy();
    expect(screen.getByText("3 of 4 setup steps complete.")).toBeTruthy();
  });

  it("gives general steps where it holds no carrier's", async () => {
    await setup({ ...before, activation: { country: "AU" }, numbers: [{ ...number, e164: "+61255501234" }] });
    expect(await screen.findByText(/open your phone's call settings/)).toBeTruthy();
    expect(screen.queryByLabelText(en.forwarding.carrier.label)).toBeNull();
  });

  it("says what's left to do once a number exists", async () => {
    await setup({ complete: [...order], numbers: [number] });
    expect(await screen.findByText(copy.steps.forwardCalls)).toBeTruthy();
    expect(screen.queryByText(copy.steps.phoneNumber)).toBeNull();
  });

  it("asks for a number until there is one", async () => {
    await setup({ ...before, trial: { status: "available" } });
    expect(await screen.findByText(copy.steps.phoneNumber)).toBeTruthy();
    expect(screen.queryByText(copy.steps.forwardCalls)).toBeNull();
  });

  it("can be skipped once a number exists", async () => {
    const { fetchMock } = await setup({ complete: [...order], numbers: [number] });
    const guide = await screen.findByLabelText(en.forwarding.carrier.label);
    const step = guide.closest('[data-slot="accordion-item"]') as HTMLElement;
    await userEvent.click(within(step).getByRole("button", { name: copy.skipStep }));
    await waitFor(() => expect(skipRequests(fetchMock)).toEqual(["phoneNumber"]));
  });
});
