// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessHoursSection, HOURS_EDITOR_HREF, windowsForSave } from "./business-hours-section";
import { AgentBasicSettingsPage } from "./live-agent-basic-settings-surface";
import { LiveSetupGuideSurface } from "./live-setup-guide-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: { day?: string }) => (options?.day ? `${key}:${options.day}` : key) }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/test-call-launcher", () => ({ startTestCall: vi.fn(), subscribeTestCallEnded: () => () => undefined }));
vi.mock("./upgrade-plan-dialog-context", () => ({ useOpenUpgradePlanDialog: () => vi.fn() }));

type Hours = { hoursSource: string; bookingMode?: string; hours: Array<{ dayOfWeek: number; openMinutes: number; closeMinutes: number }> };

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
  let state = { timezone: "Europe/Belgrade", bookingMode: "instant", ...initial };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/hours")) {
      if (init?.method === "PUT") state = { ...state, hoursSource: "operator", hours: (JSON.parse(String(init.body)) as Hours).hours };
      return Response.json(state);
    }
    if (url.startsWith("/api/setup")) return Response.json({ steps: [] });
    if (url.startsWith("/api/billing")) return Response.json({ account: null });
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
    expect(screen.getAllByLabelText(/^hours.opensAt:/)).toHaveLength(5);

    await userEvent.click(screen.getByRole("switch", { name: "hours.openOn:Saturday" }));
    await userEvent.click(screen.getByRole("button", { name: "hours.save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/hours?businessId=business", expect.objectContaining({ method: "PUT" })));
    const body = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body)) as Hours;
    expect(body.hours).toEqual([...weekdays, { dayOfWeek: 6, openMinutes: 540, closeMinutes: 1020 }]);
    await waitFor(() => expect(screen.queryByText("hours.generated")).toBeNull());
    telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "hours" });
  });

  it("adds a second window for a lunch break", async () => {
    const fetchMock = stubFetch({ hoursSource: "operator", hours: [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }] });
    render(<QueryClientProvider client={client()}><BusinessHoursSection businessId="business" canManage /></QueryClientProvider>);
    await screen.findByLabelText("hours.opensAt:Monday");
    await userEvent.click(screen.getAllByRole("button", { name: "hours.addWindow" })[0]!);
    await userEvent.click(screen.getByRole("button", { name: "hours.save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/hours?businessId=business", expect.objectContaining({ method: "PUT" })));
    const body = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body)) as Hours;
    expect(body.hours).toEqual([{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }, { dayOfWeek: 1, openMinutes: 720, closeMinutes: 1020 }]);
  });

  it("asks for the hours when there are none", async () => {
    stubFetch({ hoursSource: "none", hours: [] });
    render(<QueryClientProvider client={client()}><BusinessHoursSection businessId="business" canManage /></QueryClientProvider>);
    expect(await screen.findByText("hours.empty")).toBeTruthy();
    expect(screen.getAllByText("hours.closed")).toHaveLength(7);
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
  it("warns in the booking settings and links to the hours editor", async () => {
    stubFetch({ hoursSource: "none", hours: [] });
    render(<QueryClientProvider client={client()}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);
    const alert = (await screen.findByText("hours.noHoursAlert.title")).closest("[role=alert]") as HTMLElement;
    expect(within(alert).getByText("hours.noHoursAlert.action").closest("a")?.getAttribute("href")).toBe(HOURS_EDITOR_HREF);
    expect(document.getElementById("opening-hours")).toBeTruthy();
  });

  it("doesn't warn once the business has hours, or when it doesn't book directly", async () => {
    stubFetch({ hoursSource: "generated", hours: weekdays });
    render(<QueryClientProvider client={client()}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);
    await screen.findByText("hours.generated");
    expect(screen.queryByText("hours.noHoursAlert.title")).toBeNull();
    cleanup();

    stubFetch({ hoursSource: "none", bookingMode: "request", hours: [] });
    render(<QueryClientProvider client={client()}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);
    await screen.findByText("hours.empty");
    expect(screen.queryByText("hours.noHoursAlert.title")).toBeNull();
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
