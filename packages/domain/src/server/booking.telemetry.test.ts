import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordProductEvent: vi.fn(),
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("./productEvents", () => ({ recordProductEvent: mocks.recordProductEvent }));

import { cancelAppointment, cancelAppointmentForCaller, rescheduleAppointmentForCaller } from "./booking";

const context = { db: {} as never };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordProductEvent.mockResolvedValue("event_1");
});

describe("booking appointment change telemetry", () => {
  it("records appointment.rescheduled only after the reschedule transaction commits", async () => {
    const startsAt = new Date("2027-01-01T10:00:00Z");
    mocks.withBusinessTransaction.mockResolvedValue({ appointmentId: "apt_1", serviceId: "svc_1", startsAt, endsAt: startsAt });

    const result = await rescheduleAppointmentForCaller(context, { businessId: "biz_1", appointmentId: "apt_1", callerPhone: "+14165550100", startsAt: startsAt.toISOString(), verificationId: "verify_1" });

    expect(result).toEqual({ appointmentId: "apt_1", serviceId: "svc_1", startsAt, endsAt: startsAt });
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "appointment.rescheduled",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      properties: { appointmentId: "apt_1", source: "caller" },
    }));
    expect(mocks.withBusinessTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordProductEvent.mock.invocationCallOrder[0]!);
  });

  it("does not record a reschedule when the caller verification is not accepted", async () => {
    mocks.withBusinessTransaction.mockResolvedValue(null);

    const result = await rescheduleAppointmentForCaller(context, { businessId: "biz_1", appointmentId: "apt_1", callerPhone: "+14165550100", startsAt: "2027-01-01T10:00:00Z", verificationId: "verify_1" });

    expect(result).toBeNull();
    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("records a caller cancellation with the caller source", async () => {
    const startsAt = new Date("2027-01-01T10:00:00Z");
    mocks.withBusinessTransaction.mockResolvedValue({ appointmentId: "apt_2", serviceId: "svc_1", startsAt, endsAt: startsAt });

    await cancelAppointmentForCaller(context, { businessId: "biz_1", appointmentId: "apt_2", callerPhone: "+14165550100", verificationId: "verify_2" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "appointment.cancelled",
      businessId: "biz_1",
      properties: { appointmentId: "apt_2", source: "caller" },
    }));
  });

  it("records an operator cancellation with the operator source", async () => {
    mocks.withBusinessTransaction.mockResolvedValue(undefined);

    await cancelAppointment(context, { userId: "user_1", businessId: "biz_1", appointmentId: "apt_3" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "appointment.cancelled",
      businessId: "biz_1",
      properties: { appointmentId: "apt_3", source: "operator" },
    }));
  });

  it("does not record an operator cancellation when the transaction fails", async () => {
    mocks.withBusinessTransaction.mockRejectedValue(new Error("commit failed"));

    await expect(cancelAppointment(context, { userId: "user_1", businessId: "biz_1", appointmentId: "apt_3" })).rejects.toThrow("commit failed");

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });
});
