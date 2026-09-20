import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  asApiResponse: vi.fn((error: unknown) =>
    Response.json(
      { error: error instanceof Error ? error.message : "request failed" },
      { status: 500 },
    ),
  ),
  bookAppointment: vi.fn(),
  readJson: vi.fn(),
  recordProductEvent: vi.fn(),
  requireInternalService: vi.fn(),
  serviceRows: [] as Array<{ id: string; name: string }>,
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("@lobbystack/domain", () => ({
  bookAppointment: mocks.bookAppointment,
  recordProductEvent: mocks.recordProductEvent,
}));

vi.mock("@/lib/api-helpers", () => ({
  asApiResponse: mocks.asApiResponse,
  getAppDatabase: vi.fn(),
  readJson: mocks.readJson,
  requireInternalService: mocks.requireInternalService,
}));

vi.mock("@/lib/domain-context", () => ({
  createWorkerDomainContext: () => ({ db: {} }),
}));

vi.mock("@/lib/prospect-demo", () => ({ resolveWebVoiceAccess: vi.fn() }));
vi.mock("@/lib/web-voice-policy", () => ({ enforceWebVoiceRateLimits: vi.fn() }));
vi.mock("@/lib/voice-ai-cost", () => ({ recordVoiceAiCostLedger: vi.fn() }));

import { POST } from "./route";

const bookingBody = {
  businessId: "biz_1",
  serviceName: "Haircut",
  startsAt: "2027-01-01T10:00:00Z",
  timezone: "UTC",
  contactPhone: "+14165550100",
  channel: "web_voice",
};

function postBookAppointment() {
  return POST(
    new Request("https://admin.example.test/voice/tool/book-appointment", { method: "POST", body: "{}" }),
    { params: Promise.resolve({ segments: ["tool", "book-appointment"] }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireInternalService.mockResolvedValue(undefined);
  mocks.readJson.mockResolvedValue(bookingBody);
  mocks.recordProductEvent.mockResolvedValue("event_1");
  mocks.serviceRows = [{ id: "svc_1", name: "Haircut" }];
  mocks.withBusinessTransaction.mockImplementation(async (_db, _actor, callback) =>
    callback({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => mocks.serviceRows }),
        }),
      }),
    }),
  );
});

describe("booking tool telemetry", () => {
  it("records appointment.booked after the booking succeeds", async () => {
    mocks.bookAppointment.mockResolvedValue({ appointmentId: "apt_1", contactId: "contact_1", staffId: "staff_1" });

    const response = await postBookAppointment();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ appointmentId: "apt_1" });
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: "appointment.booked",
      businessId: "biz_1",
      properties: { appointmentId: "apt_1", channel: "voice", serviceId: "svc_1", sourceChannel: "web_voice" },
    }));
  });

  it("records appointment.booking_failed when the requested service is unavailable", async () => {
    mocks.serviceRows = [];

    const response = await postBookAppointment();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: false, reason: "Service is not available." });
    expect(mocks.bookAppointment).not.toHaveBeenCalled();
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: "appointment.booking_failed",
      businessId: "biz_1",
      properties: expect.objectContaining({ reason: "service_unavailable", requestedServiceName: "Haircut", sourceChannel: "web_voice" }),
    }));
  });

  it("records appointment.booking_failed when the booking transaction throws", async () => {
    mocks.bookAppointment.mockRejectedValue(new Error("No staff member is available for this service."));

    const response = await postBookAppointment();

    expect(response.status).toBe(500);
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: "appointment.booking_failed",
      businessId: "biz_1",
      properties: expect.objectContaining({ reason: "no_staff_available", serviceId: "svc_1", sourceChannel: "web_voice" }),
    }));
  });
});
