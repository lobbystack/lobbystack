// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../public/locales/en/common.json";
import { MoveAppointmentButton } from "./move-appointment-dialog";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// A year ahead, so the days stay in the future.
const appointment = { id: "appointment-1", startsAt: "2027-09-07T14:30:00Z", timezone: "UTC", serviceName: "Consultation", contactName: "Alex" };
const openings = ["2027-09-09T09:00:00.000Z", "2027-09-09T10:00:00.000Z", "2027-09-09T10:30:00.000Z"];
const copy = en.appointments.move;
const clients: QueryClient[] = [];
beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() }); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function setup(role: string, options: { requested?: string; otherTime?: boolean; move?: Response } = {}) {
  const i18n = createInstance();
  await i18n.init({ lng: "en", defaultNS: "common", resources: { en: { common: en } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Clinic", role, active: true }] });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const fetchMock = vi.fn(async (url: string) => url.includes("/openings") ? Response.json({ timezone: "UTC", openings: url.includes("2027-09-09") ? openings : [] }) : options.move ?? Response.json({ appointmentId: appointment.id }));
  vi.stubGlobal("fetch", fetchMock);
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><MoveAppointmentButton appointment={appointment} {...(options.otherTime ? { otherTime: true } : {})} {...(options.requested ? { requested: options.requested } : {})} /></QueryClientProvider></I18nextProvider>);
  return { fetchMock, invalidate };
}

const moveCall = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.find(([url]) => String(url).includes("/reschedule")) as [string, RequestInit] | undefined;

describe("MoveAppointmentButton", () => {
  it("is hidden from viewers, who can't move appointments", async () => {
    await setup("viewer");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens on the requested day with the requested time picked", async () => {
    const { fetchMock, invalidate } = await setup("scheduler", { requested: "2027-09-09T10:00", otherTime: true });
    await userEvent.click(screen.getByRole("button", { name: copy.otherTime }));
    expect(await screen.findByText("Requested: Thursday, September 9 at 10:00 AM")).toBeTruthy();
    const picked = await screen.findByRole("button", { name: "10:00 AM" });
    expect(picked.getAttribute("aria-pressed")).toBe("true");
    expect(fetchMock).toHaveBeenCalledWith("/api/appointments/appointment-1/openings?businessId=business&date=2027-09-09", expect.anything());
    await userEvent.click(screen.getByRole("button", { name: copy.confirm }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(copy.done));
    const [url, init] = moveCall(fetchMock)!;
    expect(url).toBe("/api/appointments/appointment-1/reschedule?businessId=business");
    expect(JSON.parse(String(init.body))).toEqual({ startsAt: "2027-09-09T10:00:00.000Z" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["appointments", "business"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["call"] });
  });

  it("starts on the appointment's day and waits for the operator to pick a time", async () => {
    const { fetchMock } = await setup("business_owner");
    await userEvent.click(screen.getByRole("button", { name: /Reschedule appointment:/ }));
    expect(await screen.findByText(en.appointments.openings.noTimes)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/appointments/appointment-1/openings?businessId=business&date=2027-09-07", expect.anything());
    expect((screen.getByRole("button", { name: copy.confirm }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks for another time when the picked one was just taken", async () => {
    const { fetchMock } = await setup("scheduler", { requested: "2027-09-09T10:00", move: Response.json({ error: "Taken.", code: "slot_unavailable", reason: "taken" }, { status: 409 }) });
    await userEvent.click(screen.getByRole("button", { name: /Reschedule appointment:/ }));
    await screen.findByRole("button", { name: "10:00 AM" });
    await userEvent.click(screen.getByRole("button", { name: copy.confirm }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(copy.taken));
    expect(screen.getByText(copy.title)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/openings")).length).toBeGreaterThan(1);
  });
});
