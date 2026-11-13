// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../public/locales/en/common.json";
import fr from "../../public/locales/fr/common.json";
import { LiveAppointmentsSurface } from "./live-appointments-surface";

const route = vi.hoisted(() => ({ search: "", replace: vi.fn(), phone: false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/appointments", useRouter: () => ({ replace: route.replace }), useSearchParams: () => new URLSearchParams(route.search) }));

const clients: QueryClient[] = [];
beforeEach(() => { route.search = ""; route.replace.mockReset(); route.phone = false; });
// The details panel and the default range follow the screen width; the media query is built once, so it reads the flag.
beforeEach(() => { vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ get matches() { return route.phone; }, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))); });
beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() }); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.useRealTimers(); });

type Calendar = { appointments?: unknown[]; timeOff?: unknown[]; hours?: unknown[] };
async function setup(locale: "en" | "fr", populated: boolean, role?: string, loading = false, calendar: Calendar = {}) {
  vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
  const i18n = createInstance();
  await i18n.init({ lng: locale, defaultNS: "common", resources: { en: { common: en }, fr: { common: fr } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Clinic", active: true, timezone: "UTC", ...(role ? { role } : {}) }] });
  const fetchMock = vi.fn(async (url: string) => {
    if (loading) return await new Promise<Response>(() => {});
    if (url.startsWith("/api/appointments?") && url.includes("from=")) return Response.json({ appointments: calendar.appointments ?? [] });
    if (url.startsWith("/api/time-off")) return Response.json({ timeOff: calendar.timeOff ?? [] });
    if (url.startsWith("/api/hours")) return Response.json({ timezone: "UTC", hours: calendar.hours ?? [] });
    if (url.startsWith("/api/catalog")) return Response.json({ services: [{ id: "service-1", name: "Haircut", active: true, assignedStaffIds: [], durationMinutes: 45 }], staff: [] });
    if (url.startsWith("/api/contacts")) return Response.json({ contacts: [] });
    if (url.startsWith("/api/appointments/openings")) return Response.json({ timezone: "UTC", openings: [] });
    throw new Error(`Unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  if (!loading) client.setQueryData(["appointments", "business"], { appointments: populated ? [{ id: "appointment", startsAt: "2026-09-06T12:00:00Z", timezone: "UTC", status: "confirmed", calendarSyncState: "synced", contactName: null, serviceName: "Consultation", staffName: "Alex" }] : [] });
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><LiveAppointmentsSurface /></QueryClientProvider></I18nextProvider>);
  return { fetchMock };
}
const booking = (id: string, startsAt: string, endsAt: string, extra: Record<string, unknown> = {}) => ({ id, startsAt, endsAt, timezone: "UTC", status: "confirmed", sourceChannel: "voice", calendarSyncState: "synced", contactName: "Rosa", serviceId: "service-1", serviceName: "Haircut", staffName: "Ana", ...extra });
// A Wednesday at 10:00 UTC: the English week runs Sunday, August 30 to Saturday, September 5.
const NOW = new Date("2026-09-02T10:00:00Z");
const rowActions = new RegExp(`^${en.appointments.rowActions.replace("{{time}}", "")}`);

describe("new appointments locale baseline", () => {
  it("shows the tabs together with the loaded list", async () => {
    route.search = "view=list";
    await setup("en", false);
    expect(screen.getAllByRole("tab").length).toBe(4);
  });
  it("shows placeholder rows instead of an empty state while the list loads", async () => {
    route.search = "view=list";
    await setup("en", false, undefined, true);
    expect(screen.getByText(en.appointments.loading)).toBeTruthy();
    expect(screen.queryByText(en.appointments.empty)).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(20);
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
    // Reschedule and Cancel sit in the row's menu, as other tables' row actions do.
    await userEvent.click(screen.getByRole("button", { name: rowActions }));
    expect(await screen.findByRole("menuitem", { name: en.appointments.move.action })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: en.appointments.cancel.action })).toBeTruthy();
    cleanup();
    route.search = "view=list";
    await setup("en", true, "viewer");
    expect(screen.queryByRole("button", { name: rowActions })).toBeNull();
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

    await userEvent.click(await screen.findByRole("button", { name: rowActions }));
    await userEvent.click(await screen.findByRole("menuitem", { name: en.appointments.cancel.action }));
    expect(screen.queryByRole("dialog", { name: "Rosa" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: en.appointments.cancel.keep }));

    await userEvent.click(screen.getByRole("button", { name: "Sun, Sep 6, 12:00 PM" }));
    const sheet = await screen.findByRole("dialog", { name: "Rosa" });
    expect(within(sheet).getByText("Feniranje na ravno + ampula - nadogradnja")).toBeTruthy();
    expect(within(sheet).getByText("Marija")).toBeTruthy();
    expect(within(sheet).getByText("45m")).toBeTruthy();
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

    expect(within(await screen.findByRole("row", { name: /3:00 PM/ })).getByRole("button", { name: rowActions })).toBeTruthy();
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
    expect(within(ended).queryByRole("button", { name: rowActions })).toBeNull();
    expect(screen.queryByRole("row", { name: /3:00 PM/ })).toBeNull();
  });

  it("filters the list by customer, service or employee as you type, and says when nothing matches", async () => {
    route.search = "view=list";
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-06T13:00:00Z") });
    const base = { timezone: "UTC", status: "confirmed", sourceChannel: "voice", calendarSyncState: "synced" };
    await setup("en", false, "scheduler");
    clients[0]!.setQueryData(["appointments", "business"], { appointments: [
      { ...base, id: "a", startsAt: "2026-09-06T15:00:00Z", endsAt: "2026-09-06T15:45:00Z", contactName: "Rosa", serviceName: "Haircut", staffName: "Ana" },
      { ...base, id: "b", startsAt: "2026-09-06T16:00:00Z", endsAt: "2026-09-06T16:45:00Z", contactName: "Marko", serviceName: "Massage", staffName: "Ivan" },
    ] });
    expect(await screen.findByRole("row", { name: /3:00 PM/ })).toBeTruthy();
    expect(screen.getByRole("row", { name: /4:00 PM/ })).toBeTruthy();
    await userEvent.type(screen.getByRole("textbox", { name: en.tableSearch.appointments }), "massage");
    await waitFor(() => expect(screen.queryByRole("row", { name: /3:00 PM/ })).toBeNull());
    expect(screen.getByRole("row", { name: /4:00 PM/ })).toBeTruthy();
    await userEvent.clear(screen.getByRole("textbox", { name: en.tableSearch.appointments }));
    await userEvent.type(screen.getByRole("textbox", { name: en.tableSearch.appointments }), "zzz");
    expect(await screen.findByText(en.tableSearch.noResults.replace("{{query}}", "zzz"))).toBeTruthy();
  });

  it("shows the Calendar column only once a calendar is connected, with each state as a chip", async () => {
    route.search = "view=list";
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-01T00:00:00Z") });
    const booking = { startsAt: "2026-09-06T12:00:00Z", endsAt: "2026-09-06T12:45:00Z", timezone: "UTC", status: "confirmed", sourceChannel: "voice", contactName: "Rosa", serviceName: "Haircut", staffName: "Ana" };
    await setup("en", false, "scheduler");
    clients[0]!.setQueryData(["appointments", "business"], { appointments: [{ ...booking, id: "a", calendarSyncState: "not_required" }] });
    expect(await screen.findByRole("row", { name: /Rosa/ })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: en.appointments.calendar })).toBeNull();
    expect(screen.queryByText(en.appointments.calendarStates.not_required)).toBeNull();
    clients[0]!.setQueryData(["appointments", "business"], { appointments: [{ ...booking, id: "a", calendarSyncState: "failed" }, { ...booking, id: "b", startsAt: "2026-09-06T14:00:00Z", endsAt: "2026-09-06T14:45:00Z", calendarSyncState: "not_required" }] });
    expect(await screen.findByRole("columnheader", { name: en.appointments.calendar })).toBeTruthy();
    expect(screen.getByText(en.appointments.calendarStates.failed)).toBeTruthy();
  });
});

describe("appointments calendar", () => {
  it("shows a grid placeholder, busy, instead of an empty calendar while it loads", async () => {
    await setup("en", false, undefined, true);
    expect(screen.getByRole("status").textContent).toBe(en.appointments.loading);
    expect(screen.getByRole("status").closest("[aria-busy]")?.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("tab")).toBeNull();
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(10);
  });

  it("opens on the week, with the List/Calendar switch after Day, Week and Month, and no Upcoming/Past", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    await setup("en", false);
    expect(await screen.findByRole("tab", { name: en.appointments.calendarView.week })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("tab", { name: en.appointments.views.calendar }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: en.appointments.calendarView.week }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: /^Aug 30\s–\sSep 5, 2026$/ })).toBeTruthy();
    const month = screen.getByRole("tab", { name: en.appointments.calendarView.month });
    expect(month.compareDocumentPosition(screen.getByRole("tab", { name: en.appointments.views.list })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("tab", { name: en.appointments.when.upcoming })).toBeNull();
  });

  it("opens on the day on phones, where a week doesn't fit", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    route.phone = true;
    await setup("en", false);
    expect((await screen.findByRole("tab", { name: en.appointments.calendarView.day })).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Wednesday, September 2, 2026" })).toBeTruthy();
  });

  it("keeps the view and range in the URL, leaving the defaults out", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    await setup("en", false);
    await userEvent.click(await screen.findByRole("tab", { name: en.appointments.calendarView.month }));
    expect(route.replace).toHaveBeenLastCalledWith("/appointments?range=month", { scroll: false });
    await userEvent.click(screen.getByRole("tab", { name: en.appointments.views.list }));
    expect(route.replace).toHaveBeenLastCalledWith("/appointments?view=list", { scroll: false });
    cleanup();
    route.search = "range=month";
    await setup("en", false);
    expect((await screen.findByRole("tab", { name: en.appointments.calendarView.month })).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: en.appointments.calendarView.week }));
    expect(route.replace).toHaveBeenLastCalledWith("/appointments", { scroll: false });
  });

  it("fetches only the shown week, on the business's clock, and moves by week", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    const { fetchMock } = await setup("en", false);
    await screen.findByRole("tab", { name: en.appointments.calendarView.week });
    expect(fetchMock).toHaveBeenCalledWith(`/api/appointments?businessId=business&from=${encodeURIComponent("2026-08-30T00:00:00.000Z")}&to=${encodeURIComponent("2026-09-06T00:00:00.000Z")}`, expect.anything());
    await userEvent.click(screen.getByRole("button", { name: en.appointments.calendarView.next }));
    expect(await screen.findByRole("heading", { name: /^Sep 6\s–\s12, 2026$/ })).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes(encodeURIComponent("2026-09-13T00:00:00.000Z")))).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: en.appointments.calendarView.today }));
    expect(await screen.findByRole("heading", { name: /^Aug 30\s–\sSep 5, 2026$/ })).toBeTruthy();
  });

  it("draws bookings as named blocks that open their details, with cancellations struck through", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    await setup("en", false, "scheduler", false, { appointments: [
      booking("a", "2026-09-03T14:00:00Z", "2026-09-03T15:00:00Z", { notes: "Bring the forms", internalNotes: "Pays cash" }),
      booking("b", "2026-09-03T14:30:00Z", "2026-09-03T15:00:00Z", { contactName: "Milan", status: "canceled" }),
    ] });
    const block = await screen.findByRole("button", { name: /^Rosa, Haircut, Thu, Sep 3, 2:00\s–\s3:00\sPM$/ });
    expect(within(block).getByText("Rosa")).toBeTruthy();
    expect(within(block).getByText("Haircut")).toBeTruthy();
    const cancelled = screen.getByRole("button", { name: /^Milan, Haircut, .*, cancelled$/ });
    expect(cancelled.className).toContain("line-through");
    // Overlapping bookings sit side by side.
    expect(block.style.width).toBe("calc(50% - 4px)");
    expect(cancelled.style.left).toBe("calc(50% + 2px)");
    await userEvent.click(block);
    const sheet = await screen.findByRole("dialog", { name: "Rosa" });
    expect((within(sheet).getByLabelText(en.appointments.create.notes) as HTMLTextAreaElement).value).toBe("Bring the forms");
    expect((within(sheet).getByLabelText(en.appointments.create.internalNotes) as HTMLTextAreaElement).value).toBe("Pays cash");
    expect(within(sheet).getByText(en.appointments.create.internalNotesHint)).toBeTruthy();
  });

  it("starts a booking from an empty slot: a draft on the grid and a popover over the calendar, which another slot moves and Escape drops", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    await setup("en", false, "scheduler");
    await screen.findByRole("tab", { name: en.appointments.calendarView.week });
    const slot = document.querySelector<HTMLButtonElement>('[data-starts-at="2026-09-03T09:30:00.000Z"]')!;
    expect(slot.getAttribute("aria-label")).toBe("New appointment at Thu, Sep 3, 9:30 AM");
    await userEvent.click(slot);
    const popover = await screen.findByRole("dialog", { name: en.appointments.create.title });
    expect(popover.getAttribute("data-slot")).toBe("popover-content");
    // It floats over the calendar rather than sitting beside it.
    expect(screen.getByRole("region", { name: en.appointments.views.calendar }).contains(popover)).toBe(false);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(within(screen.getByTestId("calendar-draft")).getByText(/9:30\s–\s10:30\sAM/)).toBeTruthy();
    expect(within(popover).getByTestId("appointment-form-time").textContent).toMatch(/Thu, Sep 3, 9:30\s–\s10:30\sAM/);
    // A date field instead of a month.
    expect(within(popover).getByLabelText(en.appointments.openings.date).textContent).toContain("Sep 3, 2026");
    await userEvent.type(within(popover).getByLabelText(en.appointments.create.notes), "Window seat");

    // Another slot moves the booking and keeps what's filled in.
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-starts-at="2026-09-04T11:00:00.000Z"]')!);
    await waitFor(() => expect(within(screen.getByTestId("calendar-draft")).getByText(/11:00\sAM\s–\s12:00\sPM/)).toBeTruthy());
    const moved = screen.getByRole("dialog", { name: en.appointments.create.title });
    expect((within(moved).getByLabelText(en.appointments.create.notes) as HTMLTextAreaElement).value).toBe("Window seat");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByTestId("calendar-draft")).toBeNull();
  });

  it("opens New appointment in a centered dialog, with no draft on the grid", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    await setup("en", false, "scheduler");
    await screen.findByRole("tab", { name: en.appointments.calendarView.week });
    await userEvent.click(screen.getByRole("button", { name: en.appointments.create.action }));
    const dialog = await screen.findByRole("dialog", { name: en.appointments.create.title });
    expect(dialog.getAttribute("data-slot")).toBe("dialog-content");
    expect(screen.queryByTestId("calendar-draft")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: en.appointments.create.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers no empty slots to viewers, who can't book", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    await setup("en", false, "viewer");
    await screen.findByRole("tab", { name: en.appointments.calendarView.week });
    expect(document.querySelector("[data-starts-at]")).toBeNull();
    expect(screen.queryByRole("button", { name: en.appointments.create.action })).toBeNull();
    expect(screen.queryByRole("button", { name: en.appointments.timeOff.action })).toBeNull();
  });

  it("hatches closed hours and shows the business's closures and an employee's time off", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    await setup("en", false, "business_owner", false, {
      hours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, openMinutes: 9 * 60, closeMinutes: 17 * 60 })),
      timeOff: [
        { id: "closure", staffId: null, staffName: null, startsAt: "2026-09-04T00:00:00Z", endsAt: "2026-09-05T00:00:00Z", name: "Staff training", note: null },
        { id: "off", staffId: "ana", staffName: "Ana", startsAt: "2026-09-03T12:00:00Z", endsAt: "2026-09-03T13:00:00Z", name: "Dentist", note: "Private" },
      ],
    });
    expect(await screen.findByRole("button", { name: /^Closed: Staff training, / })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Ana off: Dentist, / })).toBeTruthy();
    expect(document.querySelectorAll(".calendar-hatch-closed").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: en.appointments.timeOff.action })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /^Ana off: Dentist, / }));
    const dialog = await screen.findByRole("dialog", { name: en.appointments.timeOff.editTitle });
    expect((within(dialog).getByLabelText(en.appointments.timeOff.name) as HTMLInputElement).value).toBe("Dentist");
  });

  it("lists a day's bookings as chips in the month, folding the rest into +N more, which opens that day", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    route.search = "range=month";
    await setup("en", false, "scheduler", false, { appointments: [9, 10, 11, 12, 13].map((hour) => booking(`b${hour}`, `2026-09-10T${String(hour).padStart(2, "0")}:00:00Z`, `2026-09-10T${String(hour).padStart(2, "0")}:30:00Z`)) });
    const more = await screen.findByRole("button", { name: "+3 more" });
    expect(screen.getAllByRole("button", { name: /^Rosa, Haircut, Thu, Sep 10/ })).toHaveLength(2);
    await userEvent.click(more);
    expect(route.replace).toHaveBeenLastCalledWith("/appointments?range=day", { scroll: false });
    expect(await screen.findByRole("button", { name: "Thursday, September 10, 5 appointments" })).toBeTruthy();
  });
});
