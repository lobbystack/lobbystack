// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../public/locales/en/common.json";
import { TimeOffDialog, timeOffValues, timeOffWindow } from "./time-off-dialog";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const copy = en.appointments.timeOff;
const clients: QueryClient[] = [];
beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() }); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function setup(entry?: Parameters<typeof TimeOffDialog>[0]["entry"], respond?: (url: string, init?: RequestInit) => Response) {
  const i18n = createInstance();
  await i18n.init({ lng: "en", defaultNS: "common", resources: { en: { common: en } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/employees")) return Response.json({ employees: [{ id: "ana", name: "Ana" }] });
    return respond?.(url, init) ?? Response.json({ timeOff: {} }, { status: init?.method === "POST" ? 201 : 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const onOpenChange = vi.fn();
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><TimeOffDialog businessId="business" day="2026-12-24" entry={entry} onOpenChange={onOpenChange} timeZone="America/Toronto" /></QueryClientProvider></I18nextProvider>);
  return { fetchMock, onOpenChange, invalidate, dialog: await screen.findByRole("dialog") };
}
const sent = (fetchMock: ReturnType<typeof vi.fn>, method: string) => fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === method) as [string, RequestInit] | undefined;

describe("timeOffWindow and timeOffValues", () => {
  it("runs whole days from midnight to the midnight after the last day, and part of a day between its times", () => {
    expect(timeOffWindow({ span: "day", startDate: "2026-12-24", endDate: "2026-12-26", startTime: "09:00", endTime: "13:00" })).toEqual({ startsAt: "2026-12-24T00:00", endsAt: "2026-12-27T00:00" });
    expect(timeOffWindow({ span: "part", startDate: "2026-12-24", endDate: "2026-12-24", startTime: "13:00", endTime: "17:30" })).toEqual({ startsAt: "2026-12-24T13:00", endsAt: "2026-12-24T17:30" });
  });
  it("reads a saved one back on the business's clock", () => {
    expect(timeOffValues({ id: "c", staffId: null, staffName: null, startsAt: "2026-12-25T05:00:00.000Z", endsAt: "2026-12-26T05:00:00.000Z", name: "Christmas Day", note: null }, "America/Toronto")).toMatchObject({ scope: "business", span: "day", startDate: "2026-12-25", endDate: "2026-12-25" });
    expect(timeOffValues({ id: "o", staffId: "ana", staffName: "Ana", startsAt: "2026-12-24T18:00:00.000Z", endsAt: "2026-12-24T22:00:00.000Z", name: "Half day", note: "Dentist" }, "America/Toronto")).toMatchObject({ scope: "employee", staffId: "ana", span: "part", startTime: "13:00", endTime: "17:00", note: "Dentist" });
  });
});

describe("TimeOffDialog", () => {
  it("closes the whole business for a day by default and refreshes the calendar and the hours", async () => {
    const { fetchMock, onOpenChange, invalidate, dialog } = await setup();
    expect(within(dialog).getByRole("heading", { name: copy.title })).toBeTruthy();
    expect(within(dialog).getByRole("tab", { name: copy.business }).getAttribute("aria-selected")).toBe("true");
    expect(within(dialog).getByLabelText(copy.name).getAttribute("placeholder")).toBe(copy.namePlaceholder);
    await userEvent.click(within(dialog).getByRole("button", { name: copy.save }));
    expect(within(dialog).getByText(copy.nameRequired)).toBeTruthy();
    expect(sent(fetchMock, "POST")).toBeUndefined();
    await userEvent.type(within(dialog).getByLabelText(copy.name), "Christmas Eve");
    await userEvent.click(within(dialog).getByRole("button", { name: copy.save }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const [url, init] = sent(fetchMock, "POST")!;
    expect(url).toBe("/api/time-off?businessId=business");
    expect(JSON.parse(String(init.body))).toEqual({ staffId: null, name: "Christmas Eve", note: null, startsAt: "2026-12-24T00:00", endsAt: "2026-12-25T00:00" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["time-off", "business"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["business-hours", "business"] });
  });

  it("gives one employee part of a day off, and won't save an end before the start", async () => {
    const { fetchMock, dialog } = await setup();
    await userEvent.click(within(dialog).getByRole("tab", { name: copy.employee }));
    await userEvent.click(await within(dialog).findByRole("combobox", { name: copy.employeeLabelField }));
    await userEvent.click(await screen.findByRole("option", { name: "Ana" }));
    await userEvent.type(within(dialog).getByLabelText(copy.name), "Half day");
    await userEvent.click(within(dialog).getByRole("tab", { name: copy.partDay }));
    fireEvent.change(within(dialog).getByLabelText(copy.endDate), { target: { value: "2026-12-23" } });
    expect(within(dialog).getByText(copy.endBeforeStart)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(copy.endDate), { target: { value: "2026-12-24" } });
    await userEvent.type(within(dialog).getByLabelText(copy.reason), "Dentist");
    await userEvent.click(within(dialog).getByRole("button", { name: copy.save }));
    await waitFor(() => expect(sent(fetchMock, "POST")).toBeTruthy());
    expect(JSON.parse(String(sent(fetchMock, "POST")![1].body))).toEqual({ staffId: "ana", name: "Half day", note: "Dentist", startsAt: "2026-12-24T09:00", endsAt: "2026-12-24T13:00" });
  });

  it("says when the time off overlaps another", async () => {
    const { dialog } = await setup(undefined, () => Response.json({ error: "Overlap.", code: "time_off_overlap" }, { status: 400 }));
    await userEvent.type(within(dialog).getByLabelText(copy.name), "Closed");
    await userEvent.click(within(dialog).getByRole("button", { name: copy.save }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(copy.overlap));
  });

  it("edits a saved one and deletes it after a confirmation", async () => {
    const entry = { id: "closure", staffId: null, staffName: null, startsAt: "2026-12-25T05:00:00.000Z", endsAt: "2026-12-26T05:00:00.000Z", name: "Christmas Day", note: null };
    const { fetchMock, onOpenChange, dialog } = await setup(entry);
    expect(within(dialog).getByRole("heading", { name: copy.editTitle })).toBeTruthy();
    expect((within(dialog).getByLabelText(copy.startDate) as HTMLInputElement).value).toBe("2026-12-25");
    await userEvent.click(within(dialog).getByRole("button", { name: copy.delete }));
    const confirm = await screen.findByRole("alertdialog", { name: copy.deleteTitle });
    expect(sent(fetchMock, "DELETE")).toBeUndefined();
    await userEvent.click(within(confirm).getByRole("button", { name: copy.delete }));
    await waitFor(() => expect(sent(fetchMock, "DELETE")?.[0]).toBe("/api/time-off/closure?businessId=business"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
