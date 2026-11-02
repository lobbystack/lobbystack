// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../public/locales/en/common.json";
import fr from "../../public/locales/fr/common.json";
import { LiveAppointmentsSurface } from "./live-appointments-surface";

const route = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/appointments", useRouter: () => ({ replace: route.replace }), useSearchParams: () => new URLSearchParams(route.search) }));

const clients: QueryClient[] = [];
beforeEach(() => { route.search = ""; route.replace.mockReset(); });
// The details panel picks its side from the screen width.
beforeEach(() => { vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))); });
beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() }); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.useRealTimers(); });
async function setup(locale: "en" | "fr", populated: boolean, role?: string, loading = false) {
  vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
  const i18n = createInstance();
  await i18n.init({ lng: locale, defaultNS: "common", resources: { en: { common: en }, fr: { common: fr } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Clinic", active: true, ...(role ? { role } : {}) }] });
  if (loading) vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  else client.setQueryData(["appointments", "business"], { appointments: populated ? [{ id: "appointment", startsAt: "2026-09-06T12:00:00Z", timezone: "UTC", status: "confirmed", calendarSyncState: "synced", contactName: null, serviceName: "Consultation", staffName: "Alex" }] : [] });
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><LiveAppointmentsSurface /></QueryClientProvider></I18nextProvider>);
}
describe("new appointments locale baseline", () => {
  it("shows placeholders instead of an empty state while the calendar loads", async () => {
    await setup("en", false, undefined, true);
    expect(screen.getByRole("status").textContent).toBe(en.appointments.loading);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByText(en.appointments.calendarView.dayEmpty)).toBeNull();
    expect(screen.queryByPlaceholderText(en.appointments.searchPlaceholder)).toBeNull();
  });
  it("shows the tabs together with the loaded list", async () => {
    route.search = "view=list";
    await setup("en", false);
    expect(screen.getAllByRole("tab").length).toBe(4);
  });
  it("shows the search box together with the loaded calendar", async () => {
    await setup("en", false);
    expect(screen.getByPlaceholderText(en.appointments.searchPlaceholder)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("shows placeholder rows instead of an empty state while the list loads", async () => {
    route.search = "view=list";
    await setup("en", false, undefined, true);
    expect(screen.getByText(en.appointments.loading)).toBeTruthy();
    expect(screen.queryByText(en.appointments.empty)).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(20);
    expect(screen.queryByPlaceholderText(en.appointments.searchPlaceholder)).toBeNull();
  });
  it.each(["en", "fr"] as const)("renders empty states in %s", async locale => {
    route.search = "view=list";
    await setup(locale, false);
    const copy = locale === "fr" ? fr : en;
    expect(screen.getByRole("heading", { name: copy.appointments.title })).toBeTruthy();
    expect(screen.getByText(copy.appointments.empty)).toBeTruthy();
  });
  it("uses the chosen French locale for dates and enum display labels", async () => {
    route.search = "view=list";
    await setup("fr", true);
    expect(screen.getByText(/dim\./)).toBeTruthy();
    expect(screen.getByText("Confirmé")).toBeTruthy();
    expect(screen.getByText("Synchronisé")).toBeTruthy();
    expect(screen.getByText("Contact inconnu")).toBeTruthy();
  });
  it("lets schedulers cancel each appointment, and hides the action from viewers", async () => {
    route.search = "view=list";
    await setup("en", true, "scheduler");
    expect(screen.getByRole("button", { name: "Cancel appointment: Sep 6, 2026, 12:00 PM" })).toBeTruthy();
    cleanup();
    route.search = "view=list";
    await setup("en", true, "viewer");
    expect(screen.queryByRole("button", { name: /Cancel appointment/ })).toBeNull();
  });
  it("opens on the calendar, by month", async () => {
    await setup("en", false);
    expect(screen.getByRole("tab", { name: en.appointments.views.calendar }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: en.appointments.calendarView.month }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("tab", { name: en.appointments.when.upcoming })).toBeNull();
  });
  it("keeps the chosen view and range in the URL", async () => {
    await setup("en", false);
    await userEvent.click(screen.getByRole("tab", { name: en.appointments.views.list }));
    expect(route.replace).toHaveBeenLastCalledWith("/appointments?view=list", { scroll: false });
    cleanup();
    route.search = "view=list&range=week";
    await setup("en", false);
    await userEvent.click(screen.getByRole("tab", { name: en.appointments.views.calendar }));
    expect(route.replace).toHaveBeenLastCalledWith("/appointments?range=week", { scroll: false });
    cleanup();
    route.search = "range=week";
    await setup("en", false);
    expect(screen.getByRole("tab", { name: en.appointments.calendarView.week }).getAttribute("aria-selected")).toBe("true");
    await userEvent.click(screen.getByRole("tab", { name: en.appointments.calendarView.month }));
    expect(route.replace).toHaveBeenLastCalledWith("/appointments", { scroll: false });
  });
  it("shows Upcoming and Past only in the list, and keeps the view switch next to Week and Month in the calendar", async () => {
    route.search = "view=list";
    await setup("en", false);
    expect(screen.getByRole("tab", { name: en.appointments.when.upcoming })).toBeTruthy();
    expect(screen.getByRole("tab", { name: en.appointments.views.calendar })).toBeTruthy();
    cleanup();
    route.search = "";
    await setup("en", false);
    const month = screen.getByRole("tab", { name: en.appointments.calendarView.month });
    const list = screen.getByRole("tab", { name: en.appointments.views.list });
    expect(month.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("tab", { name: en.appointments.when.upcoming })).toBeNull();
  });
  it("shows the calendar by default and shows today's appointments under it", async () => {
    route.search = "";
    await setup("en", false);
    clients[0]!.setQueryData(["appointments", "business"], { appointments: [{ id: "today", startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 45 * 60_000).toISOString(), timezone: "UTC", status: "confirmed", sourceChannel: "voice", calendarSyncState: "synced", contactName: "Rosa", serviceName: "Haircut", staffName: "Ana", employeeName: "Ana" }] });
    expect((await screen.findAllByRole("button", { name: en.appointments.calendarView.today })).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rosa").length).toBeGreaterThan(0);
    expect(screen.getByText("Haircut")).toBeTruthy();
    expect(screen.getByText("with Ana")).toBeTruthy();
    // A confirmed booking needs no status badge.
    expect(screen.queryByText(en.appointments.statuses.confirmed)).toBeNull();
    // Both the phone and the desktop grid label today's cell with its booking count.
    expect(screen.getAllByRole("gridcell", { name: /1 appointment$/ })).toHaveLength(2);
  });
  it("filters by the employee in the URL, keeps a new choice there, and shows everyone for an unknown one", async () => {
    const booking = { startsAt: "2026-09-06T12:00:00Z", timezone: "UTC", status: "confirmed", sourceChannel: "voice", calendarSyncState: "synced", contactName: null, serviceName: "Haircut" };
    const twoEmployees = [{ ...booking, id: "a", staffId: "ana", staffName: "Ana" }, { ...booking, id: "b", staffId: "ivan", staffName: "Ivan" }];
    route.search = "view=list&employee=ana";
    await setup("en", false);
    clients[0]!.setQueryData(["appointments", "business"], { appointments: twoEmployees });
    expect(await screen.findByText("Ana", { selector: "td" })).toBeTruthy();
    expect(screen.queryByText("Ivan", { selector: "td" })).toBeNull();

    await userEvent.click(screen.getByRole("combobox", { name: en.appointments.filter.label }));
    await userEvent.click(await screen.findByRole("option", { name: "Ivan" }));
    expect(route.replace).toHaveBeenLastCalledWith("/appointments?view=list&employee=ivan", { scroll: false });

    cleanup();
    route.search = "view=list&employee=gone";
    await setup("en", false);
    clients.at(-1)!.setQueryData(["appointments", "business"], { appointments: twoEmployees });
    expect(await screen.findByText("Ana", { selector: "td" })).toBeTruthy();
    expect(screen.getByText("Ivan", { selector: "td" })).toBeTruthy();
  });
  it("opens a booking's full details from its row, but not from its Cancel button", async () => {
    route.search = "view=list";
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-01T00:00:00Z") });
    await setup("en", false, "scheduler");
    clients[0]!.setQueryData(["appointments", "business"], { appointments: [{ id: "a", startsAt: "2026-09-06T12:00:00Z", endsAt: "2026-09-06T12:45:00Z", timezone: "UTC", status: "confirmed", sourceChannel: "voice", calendarSyncState: "synced", contactName: "Rosa", contactPhone: "+14155550100", contactEmail: "rosa@example.invalid", serviceName: "Feniranje na ravno + ampula - nadogradnja", staffName: "Marija", employeeName: "Marija" }] });

    await userEvent.click(await screen.findByRole("button", { name: /Cancel appointment/ }));
    expect(screen.queryByRole("dialog", { name: "Rosa" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: en.appointments.cancel.keep }));

    await userEvent.click(screen.getByRole("button", { name: "Sun, Sep 6, 12:00 PM" }));
    const sheet = await screen.findByRole("dialog", { name: "Rosa" });
    expect(within(sheet).getByText("Feniranje na ravno + ampula - nadogradnja")).toBeTruthy();
    expect(within(sheet).getByText("Marija")).toBeTruthy();
    expect(within(sheet).getByText("45 min")).toBeTruthy();
    expect(within(sheet).getByRole("link", { name: "rosa@example.invalid" }).getAttribute("href")).toBe("mailto:rosa@example.invalid");
    expect(within(sheet).getByRole("link", { name: /555/ }).getAttribute("href")).toBe("tel:+14155550100");
  });
  it("lists ended appointments under Past, without a Cancel button", async () => {
    route.search = "view=list";
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-06T13:00:00Z") });
    const booking = { timezone: "UTC", status: "confirmed", sourceChannel: "voice", calendarSyncState: "synced", contactName: "Rosa", serviceName: "Haircut", staffName: "Ana" };
    const bookings = [
      { ...booking, id: "ended", startsAt: "2026-09-06T12:00:00Z", endsAt: "2026-09-06T12:45:00Z" },
      { ...booking, id: "next", startsAt: "2026-09-06T15:00:00Z", endsAt: "2026-09-06T15:45:00Z" },
    ];
    await setup("en", false, "scheduler");
    clients[0]!.setQueryData(["appointments", "business"], { appointments: bookings });

    expect(within(await screen.findByRole("row", { name: /3:00 PM/ })).getByRole("button", { name: /Cancel appointment/ })).toBeTruthy();
    expect(screen.queryByRole("row", { name: /12:00 PM/ })).toBeNull();
    // The page names no business or count under its title.
    expect(screen.queryByText(/upcoming appointment/)).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: en.appointments.when.past }));
    expect(route.replace).toHaveBeenLastCalledWith("/appointments?view=list&when=past", { scroll: false });

    cleanup();
    route.search = "view=list&when=past";
    await setup("en", false, "scheduler");
    clients.at(-1)!.setQueryData(["appointments", "business"], { appointments: bookings });
    const ended = await screen.findByRole("row", { name: /12:00 PM/ });
    expect(within(ended).queryByRole("button", { name: /Cancel appointment/ })).toBeNull();
    expect(screen.queryByRole("row", { name: /3:00 PM/ })).toBeNull();
  });
  it("searches by customer, service or staff", async () => {
    route.search = "view=list";
    await setup("en", false);
    const booking = { startsAt: "2099-09-06T12:00:00Z", endsAt: "2099-09-06T12:45:00Z", timezone: "UTC", status: "confirmed", sourceChannel: "voice", calendarSyncState: "synced" };
    clients[0]!.setQueryData(["appointments", "business"], { appointments: [{ ...booking, id: "a", contactName: "Rosa", serviceName: "Haircut", staffName: "Ana" }, { ...booking, id: "b", contactName: "Ivan", serviceName: "Massage", staffName: "Mila" }] });
    expect(await screen.findByText("Rosa", { selector: "td" })).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText(en.appointments.searchPlaceholder), "mass");
    expect(screen.queryByText("Rosa", { selector: "td" })).toBeNull();
    expect(screen.getByText("Ivan", { selector: "td" })).toBeTruthy();
  });
});
