// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../public/locales/en/common.json";
import { AppointmentForm, type AppointmentDraft } from "./appointment-form";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const copy = en.appointments.create;
const clients: QueryClient[] = [];
beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() }); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

// A year ahead, so the times stay in the future.
const day = `${new Date().getUTCFullYear() + 1}-09-09`;
const slot = `${day}T10:00:00.000Z`;

async function setup(options: { initialStartsAt?: string; openings?: string[]; unavailable?: (startsAt: string, endsAt: string) => string | null } = {}) {
  const i18n = createInstance();
  await i18n.init({ lng: "en", defaultNS: "common", resources: { en: { common: en } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/contacts")) return Response.json({ contacts: [{ id: "contact-1", name: "Milan", phone: "+14165550100", email: null }] });
    if (url.startsWith("/api/catalog")) return Response.json({ services: [{ id: "service-1", name: "Consultation", active: true, assignedStaffIds: [], durationMinutes: 30 }], staff: [] });
    if (url.startsWith("/api/appointments/openings")) return Response.json({ timezone: "UTC", openings: options.openings ?? [slot] });
    if (init?.method === "POST") return Response.json({ appointmentId: "appointment-1" }, { status: 201 });
    throw new Error(`Unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const drafts: AppointmentDraft[] = [];
  const onDone = vi.fn();
  const Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><AppointmentForm businessId="business" Footer={Footer} initialStartsAt={options.initialStartsAt ?? null} onCancel={vi.fn()} onDone={onDone} onDraftChange={(draft) => drafts.push(draft)} timeZone="UTC" unavailable={options.unavailable} /></QueryClientProvider></I18nextProvider>);
  return { fetchMock, drafts, onDone };
}

async function chooseService() {
  await userEvent.click(await screen.findByRole("combobox", { name: copy.service }));
  await userEvent.click(await screen.findByRole("option", { name: "Consultation" }));
}

describe("AppointmentForm", () => {
  it("starts on the clicked slot, an hour long until a service gives its length", async () => {
    const { drafts } = await setup({ initialStartsAt: slot });
    expect(drafts.at(-1)).toEqual({ startsAt: slot, durationMinutes: 60, serviceId: null });
    expect(screen.getByLabelText(copy.duration).textContent).toBe("1h");
    await chooseService();
    await waitFor(() => expect(drafts.at(-1)).toEqual({ startsAt: slot, durationMinutes: 30, serviceId: "service-1" }));
    expect((await screen.findByRole("button", { name: "10:00 AM" })).getAttribute("aria-pressed")).toBe("true");
  });

  it("books with a custom length and both notes, and asks for openings of that length", async () => {
    const { fetchMock, onDone } = await setup({ initialStartsAt: slot });
    await userEvent.click(screen.getByLabelText(copy.contact));
    await userEvent.click(await screen.findByRole("option", { name: /Milan/ }));
    await chooseService();
    // 30 minutes from the service becomes 45 through the picker's minute column.
    await userEvent.click(screen.getByLabelText(copy.duration));
    await userEvent.click(await screen.findByRole("option", { name: "45" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("durationMinutes=45"))).toBe(true));
    await userEvent.type(screen.getByLabelText(copy.notes), "Bring the forms");
    await userEvent.type(screen.getByLabelText(copy.internalNotes), "Pays cash");
    expect(screen.getByText(copy.notesHint)).toBeTruthy();
    expect(screen.getByText(copy.internalNotesHint)).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: "10:00 AM" }));
    await userEvent.click(screen.getByRole("button", { name: copy.confirm }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ serviceId: "service-1", startsAt: slot, durationMinutes: 45, notes: "Bring the forms", internalNotes: "Pays cash", contactId: "contact-1" });
  });

  it("says when the clicked time isn't open, or falls in time off", async () => {
    await setup({ initialStartsAt: slot, openings: [`${day}T11:00:00.000Z`] });
    await chooseService();
    expect(await screen.findByText(copy.notOpen)).toBeTruthy();
    cleanup();
    await setup({ initialStartsAt: slot, unavailable: () => "Staff training" });
    expect(screen.getByText("This time is unavailable: Staff training.")).toBeTruthy();
  });
});
