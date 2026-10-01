// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import enCommon from "../../public/locales/en/common.json";
import en from "../../public/locales/en/dashboard.json";
import frCommon from "../../public/locales/fr/common.json";
import fr from "../../public/locales/fr/dashboard.json";
import { LiveOverviewSurface } from "./live-overview-surface";
vi.mock("next/dynamic", () => ({ default: () => () => null }));
// The activation card has its own suite; this one covers follow-up parity.
vi.mock("./dashboard-activation-card", () => ({ DashboardActivationCard: () => null }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
type Overrides = { upcoming?: Array<Record<string, unknown>>; recentCalls?: Array<Record<string, unknown>> };
async function setup(locale: "en" | "fr", callId: string | null, overrides: Overrides = {}) {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
  const i18n = createInstance();
  await i18n.init({ lng: locale, defaultNS: "dashboard", resources: { en: { dashboard: en, common: enCommon }, fr: { dashboard: fr, common: frCommon } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["dashboard"], {
    businessId: "business", kpis: { calls: { total: 1, deltaPercent: 0 }, appointments: { total: 1, deltaPercent: 0 }, averageDuration: { totalSeconds: 20, deltaSeconds: 0 } }, monthlyCalls: [], recentCalls: overrides.recentCalls ?? [],
    actionRequired: [{ id: "follow-up", kind: "voice_message", title: "Voice message from Alex", body: "Please call back.\nCallback: +14165550199\nUrgency: high", callId, createdAt: "2026-09-04T14:30:00Z" }],
    upcoming: overrides.upcoming ?? [{ id: "appointment", startsAt: "2026-09-07T14:30:00Z", timezone: "UTC", status: "confirmed", sourceChannel: "voice", contactName: "Alex", serviceName: "Consultation" }],
  });
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><LiveOverviewSurface /></QueryClientProvider></I18nextProvider>);
  return i18n;
}
describe("dashboard voice follow-up parity", () => {
  it.each(["en", "fr"] as const)("links the follow-up to its call and shows localized metadata in %s", async locale => {
    const i18n = await setup(locale, "call-123");
    const title = i18n.t("home.actionRequired.titleWithContact", { message: "Please call back", name: "Alex" });
    expect(screen.getByRole("link", { name: title }).getAttribute("href")).toBe("/calls/call-123");
    expect(screen.getByText("+14165550199")).toBeTruthy();
    expect(screen.getAllByText(i18n.t("home.actionRequired.urgent"))).toHaveLength(2);
    expect(screen.getByText(i18n.t("home.upcoming.status.confirmed"))).toBeTruthy();
    expect(screen.getByText(i18n.t("common:channels.phoneCall"))).toBeTruthy();
    expect(screen.queryByText(/Urgency: high/)).toBeNull();
  });
  it("keeps a retained follow-up readable when its related call is absent", async () => {
    await setup("en", null);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/Please call back.*Alex/)).toBeTruthy();
  });
});
describe("dashboard contact and channel labels", () => {
  const appointment = { startsAt: "2026-09-07T14:30:00Z", timezone: "UTC", status: "confirmed", serviceName: "Consultation" };
  it("labels every booking channel in the upcoming card instead of showing raw slugs", async () => {
    await setup("en", null, { upcoming: [
      { ...appointment, id: "web-voice", sourceChannel: "web_voice", contactName: null, contactPhone: null, contactEmail: null },
      { ...appointment, id: "web-chat", sourceChannel: "web_chat", contactName: "Rosa", contactPhone: null, contactEmail: null },
      { ...appointment, id: "api", sourceChannel: "api", contactName: null, contactPhone: "+14155550100", contactEmail: null },
    ] });
    expect(screen.getByText("Web call")).toBeTruthy();
    expect(screen.getByText("Website chat")).toBeTruthy();
    expect(screen.getByText("API")).toBeTruthy();
    expect(screen.queryByText("web_voice")).toBeNull();
    expect(screen.queryByText("web_chat")).toBeNull();
    expect(screen.getByText("Web caller")).toBeTruthy();
    expect(screen.getByText("Rosa")).toBeTruthy();
    expect(screen.getByText("(415) 555-0100")).toBeTruthy();
    expect(screen.queryByText("Unknown contact")).toBeNull();
  });
  it("names recent callers by phone number or web call instead of unknown caller", async () => {
    await setup("en", null, { upcoming: [], recentCalls: [
      { id: "phone", startedAt: "2026-09-04T14:30:00Z", status: "completed", transport: "voice", durationSeconds: 30, contactName: null, contactPhone: "+14155550123", contactEmail: null },
      { id: "web", startedAt: "2026-09-04T15:30:00Z", status: "completed", transport: "web_voice", durationSeconds: 40, contactName: null, contactPhone: null, contactEmail: null },
    ] });
    expect(screen.getByText("(415) 555-0123")).toBeTruthy();
    expect(screen.getByText("Web caller")).toBeTruthy();
    expect(screen.queryByText(/Unknown/)).toBeNull();
  });
});
