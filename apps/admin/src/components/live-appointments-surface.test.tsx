// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../public/locales/en/common.json";
import fr from "../../public/locales/fr/common.json";
import { LiveAppointmentsSurface } from "./live-appointments-surface";

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
async function setup(locale: "en" | "fr", populated: boolean) {
  vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
  const i18n = createInstance();
  await i18n.init({ lng: locale, defaultNS: "common", resources: { en: { common: en }, fr: { common: fr } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Clinic", active: true }] });
  client.setQueryData(["appointments", "business"], { appointments: populated ? [{ id: "appointment", startsAt: "2026-09-06T12:00:00Z", timezone: "UTC", status: "confirmed", calendarSyncState: "synced", contactName: null, serviceName: "Consultation", staffName: "Alex" }] : [] });
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><LiveAppointmentsSurface /></QueryClientProvider></I18nextProvider>);
}
describe("new appointments locale baseline", () => {
  it.each(["en", "fr"] as const)("renders empty states in %s", async locale => {
    await setup(locale, false);
    const copy = locale === "fr" ? fr : en;
    expect(screen.getByRole("heading", { name: copy.appointments.title })).toBeTruthy();
    expect(screen.getByText(copy.appointments.empty)).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.appointments.refresh })).toBeTruthy();
  });
  it("uses the chosen French locale for dates and enum display labels", async () => {
    await setup("fr", true);
    expect(screen.getByText(/dim\./)).toBeTruthy();
    expect(screen.getByText("Confirmé")).toBeTruthy();
    expect(screen.getByText("Synchronisé")).toBeTruthy();
    expect(screen.getByText("Contact inconnu")).toBeTruthy();
    expect(screen.getByText("Clinic · 1 rendez-vous à venir")).toBeTruthy();
  });
});
