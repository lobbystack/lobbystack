// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveContactDetailSurface } from "./live-contact-detail-surface";

const language = vi.hoisted(() => ({ current: "sr" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: language.current }, t: (key: string) => key }) }));

const clients: QueryClient[] = [];
beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() }); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

const appointment = { startsAt: "2026-09-02T15:00:00Z", endsAt: "2026-09-02T15:30:00Z", timezone: "UTC", status: "confirmed", sourceChannel: "web_chat", serviceName: "Consultation", staffName: "Sam" };

function renderDetail(preferredLocale: string, calendarSyncStates: string[] = [], smsConsentStatus: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Business", active: true, role: "business_owner" }] });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    contact: { id: "contact", legacyConvexId: null, name: "Ana", phone: "+14155550100", email: null, timezone: null, preferredLocale, smsConsentStatus, smsConsentUpdatedAt: null, smsConsentSource: null, operatorBlockedAt: null, createdAt: "2026-09-01T12:00:00Z" },
    calls: [],
    messages: [],
    appointments: calendarSyncStates.map((calendarSyncState, index) => ({ ...appointment, id: `appointment-${index}`, calendarSyncState })),
    activityCounts: { calls: 0, messages: 0, appointments: calendarSyncStates.length, conversations: 0 },
  })));
  render(<QueryClientProvider client={client}><LiveContactDetailSurface contactId="contact" /></QueryClientProvider>);
}

describe("contact detail preferred language", () => {
  it("names the language in Latin script in the Serbian interface", async () => {
    language.current = "sr";
    renderDetail("en");
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    expect(await screen.findByText("engleski")).toBeTruthy();
    expect(screen.queryByText("енглески")).toBeNull();
  });

  it("names the language in the interface language for other locales", async () => {
    language.current = "fr";
    renderDetail("en");
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    expect(await screen.findByText("anglais")).toBeTruthy();
  });
});

describe("contact detail calendar sync state", () => {
  it("shows translated calendar sync states", async () => {
    language.current = "en";
    renderDetail("en", ["not_required", "pending", "synced", "failed"]);
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.appointments" }));
    for (const key of ["notRequired", "pending", "synced", "failed"]) {
      expect(screen.getByText(`detail.appointments.syncStateValues.${key}`)).toBeTruthy();
    }
    expect(screen.queryByText("Not required")).toBeNull();
  });

  it("falls back to readable text for an unknown sync state", async () => {
    language.current = "en";
    renderDetail("en", ["needs_reauth"]);
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.appointments" }));
    expect(screen.getByText("Needs reauth")).toBeTruthy();
  });
});

describe("contact detail SMS consent", () => {
  it.each([["declined", "declined"], ["subscribed", "subscribed"], ["opted_out", "optedOut"]])("shows the translated %s status", async (status, key) => {
    language.current = "en";
    renderDetail("en", [], status);
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    expect(screen.getByText(`detail.details.smsConsentStatusValues.${key}`)).toBeTruthy();
    expect(screen.queryByText(status)).toBeNull();
  });

  it("shows a contact who was never asked as not set", async () => {
    language.current = "en";
    renderDetail("en");
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    expect(screen.queryByText(/smsConsentStatusValues/)).toBeNull();
  });
});
