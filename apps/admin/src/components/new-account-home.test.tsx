// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
import { registerTestCallStarter } from "@/lib/test-call-launcher";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));

const clients: QueryClient[] = [];
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

const summary = (firstRealConversationAt: string | null) => ({ businessId: "business", kpis: { calls: { total: 0, deltaPercent: 0 }, appointments: { total: 0, deltaPercent: 0 }, averageDuration: { totalSeconds: 0, deltaSeconds: 0 } }, monthlyCalls: [], recentCalls: [], actionRequired: [], upcoming: [], firstRealConversationAt });
type Setup = { firstRealConversationAt?: string | null; role?: string; capabilities?: Capability[]; goal?: string | null; activation?: Record<string, unknown>; numbers?: unknown[]; trial?: Record<string, unknown>; includedNumbers?: number | null; partnerNumbers?: Record<string, unknown> | null };

async function setup({ activation = {}, capabilities, firstRealConversationAt = null, goal = null, includedNumbers = 0, numbers = [], partnerNumbers = null, role = "business_owner", trial = { status: "none" } }: Setup = {}) {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/api/activation")) return Response.json({ deploymentMode: "cloud", plan: "free_cloud", paidPlanLive: false, hasDedicatedNumber: numbers.length > 0, completedWebCalls: 0, lastTestCall: null, country: "CA", widgetsEnabled: true, websiteImport: null, ...activation });
    if (url.startsWith("/api/phone-numbers")) return Response.json({ phoneNumbers: numbers, activeClaim: null, replacement: { usedAt: null, activeClaim: null }, partnerNumbers });
    if (url.startsWith("/api/setup")) return Response.json({ steps: [{ id: "sources", status: "needs setup" }] });
    if (url.startsWith("/api/billing")) return Response.json({ entitlement: { includedNumbers } });
    if (url.startsWith("/api/number-trial")) return Response.json({ trial });
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

describe("the switch between Homes", () => {
  it("shows the three stages before the first real conversation", async () => {
    await setup({ goal: "book_appointments" });
    expect(await screen.findByText(en.newAccountHome.title.book_appointments)).toBeTruthy();
    expect(await screen.findByRole("button", { name: new RegExp(en.newAccountHome.hear.title) })).toBeTruthy();
    expect(screen.getByRole("button", { name: new RegExp(en.newAccountHome.teach.title) })).toBeTruthy();
    expect(screen.getByRole("button", { name: new RegExp(en.newAccountHome.number.title) })).toBeTruthy();
    expect(screen.queryByText(en.home.actionRequired.title)).toBeNull();
  });

  it("falls back to general copy when the owner skipped the goal", async () => {
    await setup({ goal: null });
    expect(await screen.findByText(en.newAccountHome.title.none)).toBeTruthy();
    expect(await screen.findByText(en.newAccountHome.hear.prompt.none)).toBeTruthy();
  });

  it("switches with no action when the first real conversation arrives, and stays switched", async () => {
    const { client } = await setup();
    await screen.findByText(en.newAccountHome.title.none);
    act(() => client.setQueryData(["dashboard"], summary("2026-11-01T12:00:00.000Z")));
    expect(await screen.findByText(en.home.actionRequired.title)).toBeTruthy();
    expect(screen.queryByText(en.newAccountHome.title.none)).toBeNull();
    await act(async () => { await client.invalidateQueries({ queryKey: ["activation"] }); client.setQueryData(["dashboard"], summary("2026-11-01T12:00:00.000Z")); });
    expect(screen.queryByText(en.newAccountHome.title.none)).toBeNull();
  });

  it("gives a business with a real conversation the normal Home", async () => {
    await setup({ firstRealConversationAt: "2026-11-01T12:00:00.000Z" });
    expect(await screen.findByText(en.home.actionRequired.title)).toBeTruthy();
    expect(screen.queryByText(en.newAccountHome.title.none)).toBeNull();
  });
});

describe("operators who can't act on the stages", () => {
  it.each([
    ["an owner of an activity-only business", { role: "business_owner", capabilities: ["activity"] as Capability[] }],
    ["an admin of an activity-only business", { role: "business_admin", capabilities: ["activity"] as Capability[] }],
    ["a viewer", { role: "viewer" }],
    ["a scheduler", { role: "scheduler" }],
  ])("keeps the normal Home for %s, with no setup requests", async (_who, access) => {
    const { fetchMock } = await setup(access);
    expect(await screen.findByText(en.home.actionRequired.title)).toBeTruthy();
    expect(screen.queryByText(en.newAccountHome.title.none)).toBeNull();
    expect(screen.queryByRole("button", { name: en.activation.hearIt.cta })).toBeNull();
    for (const url of apiCalls(fetchMock)) expect(url).not.toMatch(/^\/api\/(setup|phone-numbers)/);
  });
});

describe("hear it", () => {
  it("starts the test call from the page", async () => {
    const starter = vi.fn();
    const unregister = registerTestCallStarter(starter);
    await setup();
    await userEvent.click(await screen.findByRole("button", { name: en.activation.hearIt.cta }));
    expect(starter).toHaveBeenCalledOnce();
    unregister();
  });

  it("links the operator's test call to its transcript", async () => {
    await setup({ activation: { completedWebCalls: 1, lastTestCall: { id: "call-1", startedAt: "2026-11-01T12:00:00.000Z", durationSeconds: 75 } }, numbers: [] });
    const open = await screen.findByRole("button", { name: new RegExp(en.newAccountHome.hear.title) });
    await userEvent.click(open);
    const link = await screen.findByRole("link", { name: new RegExp(en.newAccountHome.hear.lastCall) });
    expect(link.getAttribute("href")).toBe("/calls/call-1");
  });

  it("reports the first call from the new-account Home, as the card does", async () => {
    await setup({ activation: { completedWebCalls: 1 } });
    await waitFor(() => expect(telemetryRef.current!.events.map((event: { name: string }) => event.name)).toContain("web.activation.first_call_completed"));
  });
});

describe("put it on your number", () => {
  const read = { activation: { completedWebCalls: 1, websiteImport: { status: "completed", websiteUrl: "https://clinic.example", importedCount: 4, indexedCount: 4 } } };

  it("offers a free business its trial number here", async () => {
    await setup({ ...read, trial: { status: "available" } });
    expect(await screen.findByRole("button", { name: en.activation.freeTrial.cta })).toBeTruthy();
  });

  it("offers a plan when the trial is gone", async () => {
    await setup({ ...read, trial: { status: "over" }, includedNumbers: 0 });
    expect(await screen.findByRole("button", { name: en.activation.upgrade.cta })).toBeTruthy();
  });

  it("walks an owner with a number through forwarding, with their country's carriers", async () => {
    await setup({ ...read, numbers: [{ id: "n", e164: "+15145550100", status: "active", reclaimScheduledAt: null }] });
    expect(await screen.findByLabelText(en.forwarding.carrier.label)).toBeTruthy();
    expect(screen.getByText(en.newAccountHome.number.switches)).toBeTruthy();
  });

  it("gives general steps where it holds no carrier's", async () => {
    await setup({ ...read, activation: { ...read.activation, country: "AU" }, numbers: [{ id: "n", e164: "+61255501234", status: "active", reclaimScheduledAt: null }] });
    expect(await screen.findByText(/open your phone's call settings/)).toBeTruthy();
    expect(screen.queryByLabelText(en.forwarding.carrier.label)).toBeNull();
  });
});
