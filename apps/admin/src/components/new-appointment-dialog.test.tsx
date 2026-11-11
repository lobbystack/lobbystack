// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../public/locales/en/common.json";
import { NewAppointmentButton, staffChoices } from "./new-appointment-dialog";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const copy = en.appointments.create;
const service = { id: "service-1", name: "Consultation", active: true, assignedStaffIds: ["staff-1", "staff-2"] };
const staff = [{ id: "staff-1", name: "Sam", active: true, isEmployee: true }, { id: "staff-2", name: "Lea", active: true, isEmployee: true }];
const contacts = [{ id: "contact-1", name: "Milan", phone: "+14165550100", email: null }, { id: "contact-2", name: "No Phone", phone: null, email: "x@example.com" }];
const clients: QueryClient[] = [];
beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() }); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

type Options = { role?: string; book?: () => Response; openings?: (url: string) => Promise<Response> | Response };

async function setup(options: Options = {}) {
  const i18n = createInstance();
  await i18n.init({ lng: "en", defaultNS: "common", resources: { en: { common: en } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Clinic", role: options.role ?? "scheduler", active: true }] });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  // The dialog opens on today; the times answered are a year ahead, so they stay in the future.
  const today = new Date().toISOString().slice(0, 10);
  const day = `${new Date().getUTCFullYear() + 1}-09-09`;
  const openings = [`${day}T09:00:00.000Z`, `${day}T10:00:00.000Z`];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/contacts")) return Response.json({ contacts });
    if (url.startsWith("/api/catalog")) return Response.json({ services: [service, { ...service, id: "service-off", name: "Retired", active: false }], staff });
    if (url.startsWith("/api/appointments/openings")) return options.openings ? await options.openings(url) : Response.json({ timezone: "UTC", openings });
    if (init?.method === "POST") return options.book?.() ?? Response.json({ appointmentId: "appointment-1" }, { status: 201 });
    throw new Error(`Unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><NewAppointmentButton timeZone="UTC" /></QueryClientProvider></I18nextProvider>);
  return { fetchMock, invalidate, day, today };
}

const bookCall = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.find(([url, init]) => String(url).startsWith("/api/appointments?") && (init as RequestInit | undefined)?.method === "POST") as [string, RequestInit] | undefined;

async function chooseService(dialog: HTMLElement) {
  await userEvent.click(await within(dialog).findByRole("combobox", { name: copy.service }));
  await userEvent.click(await screen.findByRole("option", { name: "Consultation" }));
}

describe("staffChoices", () => {
  it("offers a choice only among two or more assigned, active staff", () => {
    expect(staffChoices(service, staff).map((member) => member.id)).toEqual(["staff-1", "staff-2"]);
    expect(staffChoices({ ...service, assignedStaffIds: ["staff-1"] }, staff)).toEqual([]);
    expect(staffChoices({ ...service, assignedStaffIds: [] }, staff)).toEqual([]);
    expect(staffChoices(service, [staff[0]!, { ...staff[1]!, active: false }])).toEqual([]);
    expect(staffChoices(undefined, staff)).toEqual([]);
  });
});

describe("NewAppointmentButton", () => {
  it("is hidden from viewers, who can't book", async () => {
    await setup({ role: "viewer" });
    expect(screen.queryByRole("button", { name: copy.action })).toBeNull();
  });

  it("books an existing contact at an open time and refreshes the lists", async () => {
    const { fetchMock, invalidate, day, today } = await setup();
    await userEvent.click(screen.getByRole("button", { name: copy.action }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByLabelText(copy.contact));
    await userEvent.click(await screen.findByRole("option", { name: /Milan/ }));
    // A contact without a phone can't be texted, so it isn't offered.
    expect(screen.queryByRole("option", { name: /No Phone/ })).toBeNull();
    await chooseService(dialog);
    expect(within(dialog).getByRole("combobox", { name: copy.staff })).toBeTruthy();
    await userEvent.click(await within(dialog).findByRole("button", { name: "10:00 AM" }));
    await userEvent.click(within(dialog).getByRole("button", { name: copy.confirm }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(copy.done));
    const [url, init] = bookCall(fetchMock)!;
    expect(url).toBe("/api/appointments?businessId=business");
    expect(JSON.parse(String(init.body))).toEqual({ serviceId: "service-1", startsAt: `${day}T10:00:00.000Z`, contactId: "contact-1" });
    expect(fetchMock).toHaveBeenCalledWith(`/api/appointments/openings?businessId=business&serviceId=service-1&date=${today}`, expect.anything());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["appointments", "business"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["contacts", "business"] });
  });

  it("books a new contact by name and phone", async () => {
    const { fetchMock, day } = await setup();
    await userEvent.click(screen.getByRole("button", { name: copy.action }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: copy.newContact }));
    await userEvent.type(within(dialog).getByLabelText(copy.name), "Ana");
    await userEvent.type(within(dialog).getByLabelText(copy.phone), "4165550101");
    await chooseService(dialog);
    await userEvent.click(await within(dialog).findByRole("button", { name: "9:00 AM" }));
    await userEvent.click(within(dialog).getByRole("button", { name: copy.confirm }));
    await waitFor(() => expect(bookCall(fetchMock)).toBeTruthy());
    expect(JSON.parse(String(bookCall(fetchMock)![1].body))).toEqual({ serviceId: "service-1", startsAt: `${day}T09:00:00.000Z`, contact: { name: "Ana", phone: "+14165550101" } });
  });

  it("shows placeholders while the times load, then asks for what's missing", async () => {
    let release: (() => void) | undefined;
    const { fetchMock } = await setup({ openings: () => new Promise((resolve) => { release = () => resolve(Response.json({ timezone: "UTC", openings: [] })); }) });
    await userEvent.click(screen.getByRole("button", { name: copy.action }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: copy.confirm }));
    expect(within(dialog).getByText(copy.contactRequired)).toBeTruthy();
    expect(within(dialog).getByText(copy.serviceRequired)).toBeTruthy();
    // The day and its times are there from the start; the times wait for a service, without asking the server.
    expect(within(dialog).getByRole("region", { name: en.appointments.openings.date })).toBeTruthy();
    expect(within(dialog).getByText(en.appointments.openings.chooseService)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/openings"))).toBe(false);
    await chooseService(dialog);
    expect(within(dialog).queryByText(en.appointments.openings.chooseService)).toBeNull();
    expect(within(dialog).getByLabelText(en.appointments.openings.times).getAttribute("aria-busy")).toBe("true");
    release?.();
    expect(await within(dialog).findByText(en.appointments.openings.noTimes)).toBeTruthy();
    expect(bookCall(fetchMock)).toBeUndefined();
  });

  it("reloads the times when the picked one was just taken", async () => {
    const { fetchMock } = await setup({ book: () => Response.json({ error: "Taken.", code: "slot_unavailable" }, { status: 409 }) });
    await userEvent.click(screen.getByRole("button", { name: copy.action }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: copy.newContact }));
    await userEvent.type(within(dialog).getByLabelText(copy.name), "Ana");
    await userEvent.type(within(dialog).getByLabelText(copy.phone), "4165550101");
    await chooseService(dialog);
    await userEvent.click(await within(dialog).findByRole("button", { name: "9:00 AM" }));
    const before = fetchMock.mock.calls.filter(([url]) => String(url).includes("/openings")).length;
    await userEvent.click(within(dialog).getByRole("button", { name: copy.confirm }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(copy.taken));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/openings")).length).toBeGreaterThan(before));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
