// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../public/locales/en/common.json";
import { CancelAppointmentButton } from "./cancel-appointment-button";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const appointment = { id: "appointment-1", startsAt: "2026-09-07T14:30:00Z", timezone: "UTC", serviceName: "Consultation", contactName: "Alex" };
const clients: QueryClient[] = [];
beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() }); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function setup(role: string, options: { approve?: boolean; response?: Response } = {}) {
  const i18n = createInstance();
  await i18n.init({ lng: "en", defaultNS: "common", resources: { en: { common: en } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Clinic", role, active: true }] });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const fetchMock = vi.fn(async () => options.response ?? Response.json({ appointmentId: appointment.id, status: "canceled" }));
  vi.stubGlobal("fetch", fetchMock);
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><CancelAppointmentButton appointment={appointment} approve={options.approve ?? false} /></QueryClientProvider></I18nextProvider>);
  return { fetchMock, invalidate };
}

const copy = en.appointments.cancel;

describe("CancelAppointmentButton", () => {
  it("is hidden from viewers, who can't cancel", async () => {
    await setup("viewer");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("cancels after the operator confirms, then refreshes Home and the appointments list", async () => {
    const { fetchMock, invalidate } = await setup("scheduler");
    await userEvent.click(screen.getByRole("button", { name: "Cancel appointment: Sep 7, 2026, 2:30 PM" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText("Consultation for Alex on Mon, Sep 7, 2:30 PM. We'll remove it from your connected calendar and skip its reminder.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: copy.confirm }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["appointments", "business"] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
    expect(fetchMock).toHaveBeenCalledWith("/api/appointments/appointment-1/cancel?businessId=business", expect.objectContaining({ method: "POST" }));
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith(copy.done);
    await waitFor(() => expect(screen.queryByText(copy.title)).toBeNull());
  });

  it("keeps the appointment when the operator backs out", async () => {
    const { fetchMock } = await setup("business_owner");
    await userEvent.click(screen.getByRole("button", { name: /Cancel appointment:/ }));
    await userEvent.click(await screen.findByRole("button", { name: copy.keep }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("approves a caller's request with the same cancel, which closes the request", async () => {
    const { fetchMock } = await setup("business_admin", { approve: true });
    await userEvent.click(screen.getByRole("button", { name: copy.approve }));
    expect(await screen.findByText(/close the request\.$/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: copy.confirm }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/appointments/appointment-1/cancel?businessId=business", expect.objectContaining({ method: "POST" })));
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBeUndefined();
  });

  it("treats an appointment someone already cancelled as done", async () => {
    const { invalidate } = await setup("scheduler", { response: Response.json({ error: "This appointment is already cancelled.", code: "already_cancelled" }, { status: 409 }) });
    await userEvent.click(screen.getByRole("button", { name: /Cancel appointment:/ }));
    await userEvent.click(await screen.findByRole("button", { name: copy.confirm }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["dashboard"] }));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and says so when the cancel fails", async () => {
    const { invalidate } = await setup("scheduler", { response: Response.json({ error: "Request failed." }, { status: 500 }) });
    await userEvent.click(screen.getByRole("button", { name: /Cancel appointment:/ }));
    await userEvent.click(await screen.findByRole("button", { name: copy.confirm }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(copy.failed));
    expect(screen.getByText(copy.title)).toBeTruthy();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
