// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveCallDetailSurface } from "./live-call-detail-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/calls/call-1" }));

const clients: QueryClient[] = [];
beforeEach(() => {
  telemetryRef.current = createRecordedBrowserTelemetry();
  vi.stubGlobal("localStorage", { getItem: () => "en", setItem: vi.fn() });
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

type FollowUp = { id: string; title: string; body: string; status: string; request?: string | null; requested?: { newStartsAt?: string } | null; appointment?: { id: string; startsAt: string; timezone: string; status: string; serviceName: string | null; contactName: string | null } | null; createdAt: string; updatedAt: string };
const followUp = (id: string, overrides: Partial<FollowUp> = {}): FollowUp => ({ id, title: "Call back", body: "Please call back", status: "open", createdAt: "2026-09-01T12:06:00Z", updatedAt: "2026-09-01T12:06:00Z", ...overrides });

function setup(followUpTasks: FollowUp[] = [followUp("inbox-1")], role?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, ...(role ? { role } : {}) }] });
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return Response.json({ completed: 1 });
    return Response.json({
      call: { id: "call-1", legacyConvexId: null, providerCallId: "CA1", provider: "twilio", transport: "voice", status: "completed", disposition: null, transferState: null, startedAt: "2026-09-01T12:00:00Z", endedAt: "2026-09-01T12:05:00Z", providerDurationSeconds: 300, gatewaySessionId: null },
      contact: null,
      outcome: null,
      timeline: [],
      transcript: [],
      recording: { state: "missing" },
      appointments: [],
      followUpTasks,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LiveCallDetailSurface callId="call-1" /></QueryClientProvider>);
  return fetchMock;
}

describe("voice follow-up telemetry", () => {
  it("records follow_up_completed with the inbox item identifier", async () => {
    const fetchMock = setup();
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    await userEvent.click(await screen.findByRole("button", { name: "detail.details.markDone" }));
    await waitFor(() => telemetryRef.current!.expectEvent("web.voice.follow_up_completed", { businessId: "business", callId: "call-1", inboxItemId: "inbox-1" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/calls/call-1?businessId=business", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "complete_follow_up", inboxItemId: "inbox-1" }) }));
  });
});

describe("several follow-ups on one call", () => {
  it("lists the message and each cancellation request, and marks only the chosen one done", async () => {
    const fetchMock = setup([
      followUp("request-2", { body: "Cancellation request: Cleaning", request: "appointment_cancellation" }),
      followUp("message", { body: "Please call back about parking" }),
      // An imported duplicate of the message shows once.
      followUp("message-duplicate", { body: "Please call back (imported)" }),
      followUp("request-1", { body: "Cancellation request: Consultation", request: "appointment_cancellation" }),
      followUp("closed", { body: "Already handled", status: "done" }),
    ]);
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    // Each request shows its localized title and requested service; the message keeps the agent's text. The mocked translator returns keys.
    expect(screen.getAllByText("followUp.cancellationRequest")).toHaveLength(2);
    expect(screen.getAllByText("followUp.requested")).toHaveLength(2);
    expect(screen.getByText("Please call back about parking")).toBeTruthy();
    expect(screen.queryByText("Please call back (imported)")).toBeNull();
    expect(screen.queryByText("Already handled")).toBeNull();
    const buttons = screen.getAllByRole("button", { name: "detail.details.markDone" });
    expect(buttons).toHaveLength(3);
    await userEvent.click(buttons[2]!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/calls/call-1?businessId=business", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "complete_follow_up", inboxItemId: "request-1" }) })));
  });
});

describe("approving a caller's request from the call page", () => {
  const appointment = { id: "appointment-1", startsAt: "2099-09-07T14:30:00Z", timezone: "UTC", status: "confirmed", serviceName: "Consultation", contactName: "Milan" };
  const reschedule = (overrides: Partial<FollowUp> = {}) => followUp("reschedule", { body: "Reschedule request: Consultation", request: "appointment_reschedule", requested: { newStartsAt: "2099-09-09T10:00" }, appointment, ...overrides });

  it("offers to approve a cancellation next to Mark done", async () => {
    setup([followUp("cancel", { body: "Cancellation request: Consultation", request: "appointment_cancellation", appointment })], "scheduler");
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    expect(await screen.findByRole("button", { name: "appointments.cancel.approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "detail.details.markDone" })).toBeTruthy();
  });

  it("shows the new time and offers to approve a reschedule", async () => {
    setup([reschedule()], "scheduler");
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    expect(screen.getByText("followUp.rescheduleRequest")).toBeTruthy();
    expect(screen.getByText("followUp.newTime")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "appointments.reschedule.approve" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "appointments.cancel.approve" })).toBeNull();
  });

  it("moves the appointment to the requested time once approved", async () => {
    const fetchMock = setup([reschedule()], "scheduler");
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    await userEvent.click(await screen.findByRole("button", { name: "appointments.reschedule.approve" }));
    await userEvent.click(await screen.findByRole("button", { name: "appointments.reschedule.confirm" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/appointments/appointment-1/reschedule?businessId=business", expect.objectContaining({ method: "POST", body: JSON.stringify({ startsAt: "2099-09-09T10:00:00.000Z" }) })));
  });

  it("offers nothing to approve without a matched appointment, with a cancelled one, without the new time, or to a viewer", async () => {
    for (const [tasks, role] of [
      [[reschedule({ appointment: null })], "scheduler"],
      [[reschedule({ appointment: { ...appointment, status: "canceled" } })], "scheduler"],
      [[reschedule({ requested: null })], "scheduler"],
      [[reschedule()], "viewer"],
    ] as const) {
      cleanup();
      setup([...tasks], role);
      await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
      expect(await screen.findByRole("button", { name: "detail.details.markDone" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "appointments.reschedule.approve" })).toBeNull();
    }
  });
});
