import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ recordProductEvent: vi.fn(), withBusinessTransaction: vi.fn(), bookAppointment: vi.fn() }));

vi.mock("@lobbystack/db", async (original) => ({ ...(await original<typeof import("@lobbystack/db")>()), withBusinessTransaction: mocks.withBusinessTransaction }));
vi.mock("./productEvents", () => ({ recordProductEvent: mocks.recordProductEvent, recordProductEventBestEffort: mocks.recordProductEvent }));
vi.mock("./booking", () => ({ bookAppointment: mocks.bookAppointment, findOpeningsInTransaction: vi.fn(), cancelAppointmentForCaller: vi.fn(), rescheduleAppointmentForCaller: vi.fn() }));

import { BookingUnavailableError } from "../availability";
import { bookAppointmentForOperator } from "./operatorBookings";

const context = { db: {} as never };
const input = { userId: "user_1", businessId: "biz_1", serviceId: "svc_1", startsAt: "2099-01-01T15:00:00.000Z", contactId: "contact_1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordProductEvent.mockResolvedValue("event_1");
  // The operator's checks, then the booking's service lookup.
  mocks.withBusinessTransaction
    .mockResolvedValueOnce({ timezone: "America/Toronto", contactPhone: "+14165550100" })
    .mockResolvedValueOnce({ service: { id: "svc_1", name: "Consultation" }, existing: undefined });
});

describe("operator booking telemetry", () => {
  it("records appointment.booked from the dashboard, as the operator, after the booking commits", async () => {
    mocks.bookAppointment.mockResolvedValue({ appointmentId: "apt_1", contactId: "contact_1", staffId: "staff_1" });

    await expect(bookAppointmentForOperator(context, input)).resolves.toEqual({ appointmentId: "apt_1" });

    expect(mocks.bookAppointment).toHaveBeenCalledWith(context, expect.objectContaining({ businessId: "biz_1", serviceId: "svc_1", contactPhone: "+14165550100", sourceChannel: "dashboard", operatorUserId: "user_1" }));
    expect(mocks.withBusinessTransaction.mock.calls[1]![1]).toEqual({ businessId: "biz_1", userId: "user_1", actorType: "operator" });
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "appointment.booked",
      businessId: "biz_1",
      properties: { appointmentId: "apt_1", channel: "dashboard", serviceId: "svc_1", sourceChannel: "dashboard" },
    }));
    expect(mocks.bookAppointment.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordProductEvent.mock.invocationCallOrder[0]!);
  });

  it("records appointment.booking_failed when the time was taken", async () => {
    mocks.bookAppointment.mockRejectedValue(new BookingUnavailableError("taken"));

    await expect(bookAppointmentForOperator(context, input)).rejects.toBeInstanceOf(BookingUnavailableError);

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({ name: "appointment.booking_failed", properties: expect.objectContaining({ reason: "slot_unavailable", channel: "dashboard" }) }));
  });
});
