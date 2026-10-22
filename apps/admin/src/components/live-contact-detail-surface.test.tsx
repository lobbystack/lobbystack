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

describe("contact detail keypad PIN", () => {
  function renderWithPasscode(passcode: { setAt: string; locked: boolean } | null, role = "business_owner") {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Business", active: true, role }] });
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        return Response.json({ contactId: "contact", passcode: method === "PUT" ? { setAt: "2026-10-13T12:00:00Z", locked: false } : null });
      }
      return Response.json({
        contact: { id: "contact", legacyConvexId: null, name: "Ana", phone: "+14155550100", email: null, timezone: null, preferredLocale: null, smsConsentStatus: null, smsConsentUpdatedAt: null, smsConsentSource: null, operatorBlockedAt: null, createdAt: "2026-09-01T12:00:00Z" },
        passcode,
        calls: [],
        messages: [],
        appointments: [],
        activityCounts: { calls: 0, messages: 0, appointments: 0, conversations: 0 },
      });
    }));
    render(<QueryClientProvider client={client}><LiveContactDetailSurface contactId="contact" /></QueryClientProvider>);
    return requests;
  }

  it("sets a PIN and refuses an easy one first", async () => {
    language.current = "en";
    const requests = renderWithPasscode(null);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    expect(screen.getByText("detail.passcode.statusNotSet")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "detail.passcode.setAction" }));
    const input = await screen.findByLabelText("detail.passcode.label");
    await user.type(input, "1111");
    await user.click(screen.getByRole("button", { name: "detail.passcode.save" }));
    expect(await screen.findByText("detail.passcode.guessable")).toBeTruthy();
    expect(requests).toEqual([]);

    await user.clear(input);
    await user.type(input, "48a0-613");
    expect((input as HTMLInputElement).value).toBe("480613");
    await user.click(screen.getByRole("button", { name: "detail.passcode.save" }));
    await vi.waitFor(() => expect(requests).toEqual([{ url: "/api/contacts/contact/passcode?businessId=business", method: "PUT", body: { passcode: "480613" } }]));
  });

  it("offers a generated PIN that isn't guessable", async () => {
    language.current = "en";
    renderWithPasscode(null);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    await user.click(screen.getByRole("button", { name: "detail.passcode.setAction" }));
    await user.click(await screen.findByRole("button", { name: "detail.passcode.generate" }));
    const value = (screen.getByLabelText("detail.passcode.label") as HTMLInputElement).value;
    expect(value).toMatch(/^\d{6}$/);
  });

  it("shows a locked PIN and removes it", async () => {
    language.current = "en";
    const requests = renderWithPasscode({ setAt: "2026-10-01T09:00:00Z", locked: true });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    expect(screen.getByText("detail.passcode.statusLocked")).toBeTruthy();
    expect(screen.getByRole("button", { name: "detail.passcode.changeAction" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "detail.passcode.removeAction" }));
    await user.click(await screen.findByRole("button", { name: "detail.passcode.removeConfirm" }));
    await vi.waitFor(() => expect(requests).toEqual([{ url: "/api/contacts/contact/passcode?businessId=business", method: "DELETE", body: undefined }]));
  });

  it("hides the PIN buttons from members who can't change contacts", async () => {
    language.current = "en";
    renderWithPasscode({ setAt: "2026-10-01T09:00:00Z", locked: false }, "scheduler");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    expect(screen.getByText("detail.passcode.statusSet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "detail.passcode.changeAction" })).toBeNull();
    expect(screen.queryByRole("button", { name: "detail.passcode.removeAction" })).toBeNull();
  });
});
