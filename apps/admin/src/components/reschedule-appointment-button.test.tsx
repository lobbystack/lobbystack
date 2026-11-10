// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../public/locales/en/common.json";
import { RescheduleAppointmentButton } from "./reschedule-appointment-button";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const appointment = { id: "appointment-1", startsAt: "2026-09-07T14:30:00Z", timezone: "UTC", serviceName: "Consultation", contactName: "Alex" };
const clients: QueryClient[] = [];
beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() }); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function setup(role: string, newStartsAt: string) {
  const i18n = createInstance();
  await i18n.init({ lng: "en", defaultNS: "common", resources: { en: { common: en } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Clinic", role, active: true }] });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><RescheduleAppointmentButton appointment={appointment} newStartsAt={newStartsAt} /></QueryClientProvider></I18nextProvider>);
}

const copy = en.appointments.reschedule;

describe("RescheduleAppointmentButton", () => {
  it("offers the approval while the requested time is still ahead", async () => {
    await setup("scheduler", new Date(Date.now() + 7 * 86_400_000).toISOString());
    expect(screen.getByRole("button", { name: copy.approve })).toBeTruthy();
    expect(screen.queryByText(copy.passed)).toBeNull();
  });

  it("says the requested time has passed instead of leaving the operator with only Mark done", async () => {
    await setup("scheduler", "2020-01-01T10:00:00Z");
    expect(screen.getByText(copy.passed)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("stays hidden from a viewer who can't move appointments", async () => {
    await setup("viewer", "2020-01-01T10:00:00Z");
    expect(screen.queryByText(copy.passed)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
