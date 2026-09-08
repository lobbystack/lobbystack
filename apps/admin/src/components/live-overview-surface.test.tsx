// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../public/locales/en/dashboard.json";
import fr from "../../public/locales/fr/dashboard.json";
import { LiveOverviewSurface } from "./live-overview-surface";
vi.mock("next/dynamic", () => ({ default: () => () => null }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
async function setup(locale: "en" | "fr", callId: string | null) {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
  const i18n = createInstance();
  await i18n.init({ lng: locale, defaultNS: "dashboard", resources: { en: { dashboard: en }, fr: { dashboard: fr } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["dashboard"], {
    businessId: "business", kpis: { calls: { total: 1, deltaPercent: 0 }, appointments: { total: 1, deltaPercent: 0 }, averageDuration: { totalSeconds: 20, deltaSeconds: 0 } }, monthlyCalls: [], recentCalls: [],
    actionRequired: [{ id: "follow-up", kind: "voice_message", title: "Voice message from Alex", body: "Please call back.\nCallback: +14165550199\nUrgency: high", callId, createdAt: "2026-09-04T14:30:00Z" }],
    upcoming: [{ id: "appointment", startsAt: "2026-09-07T14:30:00Z", timezone: "UTC", status: "confirmed", sourceChannel: "voice", contactName: "Alex", serviceName: "Consultation" }],
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
    expect(screen.getByText(i18n.t("home.upcoming.source.voice"))).toBeTruthy();
    expect(screen.queryByText(/Urgency: high/)).toBeNull();
  });
  it("keeps a retained follow-up readable when its related call is absent", async () => {
    await setup("en", null);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/Please call back.*Alex/)).toBeTruthy();
  });
});
