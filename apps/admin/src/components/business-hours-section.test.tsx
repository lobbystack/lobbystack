// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planEntitlement } from "@lobbystack/shared";

import { BusinessHoursSection, closuresForSave, windowsForSave } from "./business-hours-section";
import { LiveSetupGuideSurface } from "./live-setup-guide-surface";
import { AgentBasicSettingsPage } from "./live-agent-basic-settings-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: { day?: string; list?: string; number?: number }) => (options?.day ? `${key}:${options.day}` : options?.list ? `${key}:${options.list}` : options?.number ? `${key}:${options.number}` : key) }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/test-call-launcher", () => ({ startTestCall: vi.fn(), subscribeTestCallEnded: () => () => undefined, subscribeTestCallStarter: () => () => undefined, getTestCallStarter: () => null }));
vi.mock("./upgrade-plan-dialog-context", () => ({ useOpenUpgradePlanDialog: () => vi.fn() }));

type Closure = { startsAt: string; endsAt: string; reason: string };
type Hours = { hoursSource: string; bookingMode?: string; hours: Array<{ dayOfWeek: number; openMinutes: number; closeMinutes: number }>; closures?: Closure[] };

const clients: QueryClient[] = [];
beforeEach(() => {
  telemetryRef.current = createRecordedBrowserTelemetry();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

function client() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(queryClient);
  return queryClient;
}

function stubFetch(initial: Hours, profile: Record<string, unknown> = {}) {
  let state = { timezone: "Europe/Belgrade", bookingMode: "instant", closures: [] as Closure[], ...initial };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/hours")) {
      if (init?.method === "PUT") state = { ...state, hoursSource: "operator", ...(JSON.parse(String(init.body)) as Pick<Hours, "hours" | "closures">) };
      return Response.json(state);
    }
    if (url.startsWith("/api/setup")) return Response.json({ steps: [] });
    if (url.startsWith("/api/billing")) return Response.json({ account: null, entitlement: planEntitlement("free_cloud") });
    return Response.json({ business: { defaultLocale: "en" }, profile: { greeting: "Hi", summary: "", summarySource: "placeholder", transferNumber: null, transferMode: "none", appointmentChangePolicy: null, bookingMode: state.bookingMode, ...profile } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const weekdays = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, openMinutes: 540, closeMinutes: 1200 }));

describe("opening hours editor", () => {
  it("says AI filled the hours from the knowledge sources, and saving makes them the operator's", async () => {
    const fetchMock = stubFetch({ hoursSource: "generated", hours: weekdays });
    render(<QueryClientProvider client={client()}><BusinessHoursSection businessId="business" canManage /></QueryClientProvider>);
    expect(await screen.findByText("hours.generated")).toBeTruthy();
    // Collapsed to a summary until the operator opens the editor.
    await waitFor(() => expect(screen.getByTestId("hours-summary").textContent).toBe("Mon–Fri 09:00–20:00"));
    expect(screen.queryAllByLabelText(/^hours.opensAt:/)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "hours.edit" }));
    expect(screen.getAllByLabelText(/^hours.opensAt:/)).toHaveLength(5);

    await userEvent.click(screen.getByRole("switch", { name: "hours.openOn:Saturday" }));
    await userEvent.click(screen.getByRole("button", { name: "hours.save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/hours?businessId=business", expect.objectContaining({ method: "PUT" })));
    const body = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body)) as Hours;
    expect(body.hours).toEqual([...weekdays, { dayOfWeek: 6, openMinutes: 540, closeMinutes: 1020 }]);
    await waitFor(() => expect(screen.queryByText("hours.generated")).toBeNull());
    expect(screen.getByTestId("hours-summary").textContent).toBe("Mon–Fri 09:00–20:00, Sat 09:00–17:00");
    expect(toast.success).toHaveBeenCalledWith("actions.saved");
    telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "hours" });
  });

  it("adds a second window for a lunch break", async () => {
    const fetchMock = stubFetch({ hoursSource: "operator", hours: [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }] });
    render(<QueryClientProvider client={client()}><BusinessHoursSection businessId="business" canManage /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "hours.edit" }));
    await screen.findByLabelText("hours.opensAt:Monday");
    await userEvent.click(screen.getAllByRole("button", { name: "hours.addWindow" })[0]!);
    await userEvent.click(screen.getByRole("button", { name: "hours.save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/hours?businessId=business", expect.objectContaining({ method: "PUT" })));
    const body = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body)) as Hours;
    expect(body.hours).toEqual([{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }, { dayOfWeek: 1, openMinutes: 720, closeMinutes: 1020 }]);
  });

  it("picks a closing time from the time picker", async () => {
    const fetchMock = stubFetch({ hoursSource: "operator", hours: [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1020 }] });
    render(<QueryClientProvider client={client()}><BusinessHoursSection businessId="business" canManage /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "hours.edit" }));
    const closing = await screen.findByRole("button", { name: "hours.closesAt:Monday" });
    expect(closing.textContent).toBe("17:00");
    await userEvent.click(closing);
    await userEvent.click(within(await screen.findByRole("listbox", { name: "hours.picker.hours" })).getByRole("option", { name: "18" }));
    await userEvent.click(within(screen.getByRole("listbox", { name: "hours.picker.minutes" })).getByRole("option", { name: "30" }));
    expect(closing.textContent).toBe("18:30");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "hours.save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/hours?businessId=business", expect.objectContaining({ method: "PUT" })));
    const body = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body)) as Hours;
    expect(body.hours).toEqual([{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 1110 }]);
  });

  it("asks for the hours when there are none", async () => {
    stubFetch({ hoursSource: "none", hours: [] });
    render(<QueryClientProvider client={client()}><BusinessHoursSection businessId="business" canManage /></QueryClientProvider>);
    expect(await screen.findByText("hours.neededForBooking")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "hours.add" }));
    expect(screen.getAllByText("hours.closed")).toHaveLength(7);
  });

  it("saves a closure with the hours and lists it in the summary", async () => {
    const fetchMock = stubFetch({ hoursSource: "operator", hours: weekdays });
    const year = new Date().getFullYear() + 1;
    render(<QueryClientProvider client={client()}><BusinessHoursSection businessId="business" canManage /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "hours.edit" }));
    await userEvent.click(screen.getByRole("button", { name: "hours.closures.add" }));
    fireEvent.change(screen.getByLabelText("hours.closures.startsAt:1"), { target: { value: `${year}-12-25T00:00` } });
    fireEvent.change(screen.getByLabelText("hours.closures.endsAt:1"), { target: { value: `${year}-12-26T00:00` } });
    await userEvent.type(screen.getByLabelText("hours.closures.reason:1"), "Christmas Day");
    await userEvent.click(screen.getByRole("button", { name: "hours.save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/hours?businessId=business", expect.objectContaining({ method: "PUT" })));
    const body = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body)) as Hours;
    expect(body).toEqual({ hours: weekdays, closures: [{ startsAt: `${year}-12-25T00:00`, endsAt: `${year}-12-26T00:00`, reason: "Christmas Day" }] });
    await waitFor(() => expect(screen.getByTestId("closures-summary").textContent).toContain("(Christmas Day)"));
  });

  it("flags a closure that doesn't end after it starts without saving", async () => {
    const fetchMock = stubFetch({ hoursSource: "operator", hours: weekdays });
    render(<QueryClientProvider client={client()}><BusinessHoursSection businessId="business" canManage /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "hours.edit" }));
    await userEvent.click(screen.getByRole("button", { name: "hours.closures.add" }));
    await userEvent.click(screen.getByRole("button", { name: "hours.save" }));
    expect(screen.getByRole("alert").textContent).toBe("hours.closures.order");
    expect(screen.getByLabelText("hours.closures.startsAt:1").getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/hours?businessId=business", expect.objectContaining({ method: "PUT" }));
  });

  it("names each closure row and points the invalid row at the error", async () => {
    const year = new Date().getFullYear() + 1;
    stubFetch({ hoursSource: "operator", hours: weekdays, closures: [{ startsAt: `${year}-12-25T00:00`, endsAt: `${year}-12-26T00:00`, reason: "" }] });
    render(<QueryClientProvider client={client()}><BusinessHoursSection businessId="business" canManage /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "hours.edit" }));
    await userEvent.click(screen.getByRole("button", { name: "hours.closures.add" }));
    expect(screen.getByRole("button", { name: "hours.closures.remove:1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "hours.closures.remove:2" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "hours.save" }));
    const errorId = screen.getByRole("alert").id;
    expect(errorId).toBeTruthy();
    expect(screen.getByLabelText("hours.closures.startsAt:2").getAttribute("aria-describedby")).toBe(errorId);
    expect(screen.getByLabelText("hours.closures.endsAt:2").getAttribute("aria-describedby")).toBe(errorId);
    expect(screen.getByLabelText("hours.closures.startsAt:1").getAttribute("aria-describedby")).toBeNull();
  });

  it("shows a translated message when the server refuses the save", async () => {
    const fetchMock = stubFetch({ hoursSource: "operator", hours: weekdays });
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) => (init?.method === "PUT" ? Response.json({ error: "A closure must end within two years." }, { status: 400 }) : await base(url, init)));
    render(<QueryClientProvider client={client()}><BusinessHoursSection businessId="business" canManage /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "hours.edit" }));
    await userEvent.click(screen.getByRole("button", { name: "hours.save" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("actions.saveFailed"));
  });

  it("checks closures before saving", () => {
    const now = "2026-10-09T12:00";
    const christmas = { startsAt: "2026-12-25T00:00", endsAt: "2026-12-26T00:00", reason: "" };
    expect(closuresForSave([christmas, { startsAt: "2026-10-09T00:00", endsAt: "2026-10-10T00:00", reason: "" }], now)).toEqual({ ok: true });
    expect(closuresForSave([christmas, { startsAt: "2026-10-01T00:00", endsAt: "2026-10-09T12:00", reason: "" }], now)).toEqual({ ok: false, index: 1, problem: "ended" });
    expect(closuresForSave([{ startsAt: "2026-12-25T12:00", endsAt: "2026-12-27T00:00", reason: "" }, christmas], now)).toEqual({ ok: false, index: 0, problem: "overlap" });
    expect(closuresForSave([christmas, { ...christmas, startsAt: "" }], now)).toEqual({ ok: false, index: 1, problem: "order" });
    expect(closuresForSave([{ startsAt: "2028-10-09T00:00", endsAt: "2028-10-09T12:00", reason: "" }], now)).toEqual({ ok: true });
    expect(closuresForSave([christmas, { startsAt: "2028-12-25T00:00", endsAt: "2028-12-26T00:00", reason: "" }], now)).toEqual({ ok: false, index: 1, problem: "far" });
  });

  it("checks windows before saving", () => {
    const days = Array.from({ length: 7 }, () => [] as Array<{ open: string; close: string }>);
    days[2] = [{ open: "09:00", close: "13:00" }, { open: "12:00", close: "17:00" }];
    expect(windowsForSave(days)).toEqual({ ok: false, dayOfWeek: 2 });
    days[2] = [{ open: "18:00", close: "00:00" }];
    expect(windowsForSave(days)).toEqual({ ok: true, hours: [{ dayOfWeek: 2, openMinutes: 1080, closeMinutes: 1440 }] });
    days[2] = [{ open: "17:00", close: "09:00" }];
    expect(windowsForSave(days)).toEqual({ ok: false, dayOfWeek: 2 });
  });
});

describe("instant booking without opening hours", () => {
  it("asks for hours in the hours row itself, with no second banner", async () => {
    stubFetch({ hoursSource: "none", hours: [] });
    render(<QueryClientProvider client={client()}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);
    expect(await screen.findByText("hours.neededForBooking")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.getElementById("opening-hours")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "hours.add" }));
    expect(await screen.findAllByLabelText(/^hours.openOn:/)).toHaveLength(7);
  });

  it("doesn't ask for hours once the business has them, or when it doesn't book directly", async () => {
    stubFetch({ hoursSource: "generated", hours: weekdays });
    render(<QueryClientProvider client={client()}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);
    await screen.findByText("hours.generated");
    expect(screen.queryByText("hours.neededForBooking")).toBeNull();
    cleanup();

    stubFetch({ hoursSource: "none", bookingMode: "request", hours: [] });
    render(<QueryClientProvider client={client()}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);
    await screen.findByText("hours.notSet");
    expect(screen.queryByText("hours.neededForBooking")).toBeNull();
  });

  it("doesn't open the hours editor from the link for someone who can't edit it", async () => {
    stubFetch({ hoursSource: "none", hours: [] });
    window.history.replaceState(null, "", "#opening-hours");
    render(<QueryClientProvider client={client()}><BusinessHoursSection businessId="business" canManage={false} /></QueryClientProvider>);
    await screen.findByText("hours.neededForBooking");
    expect(screen.queryAllByLabelText(/^hours.openOn:/)).toHaveLength(0);
    window.history.replaceState(null, "", "#");
  });

  it("warns in the setup guide", async () => {
    stubFetch({ hoursSource: "none", hours: [] });
    const queryClient = client();
    queryClient.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
    queryClient.setQueryData(["setup", "business"], { steps: [{ id: "fullScan", status: "needs setup" }] });
    render(<QueryClientProvider client={queryClient}><LiveSetupGuideSurface /></QueryClientProvider>);
    expect(await screen.findByText("hours.noHoursAlert.title")).toBeTruthy();
  });
});

