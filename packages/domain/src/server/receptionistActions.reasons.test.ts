import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rescheduleAppointmentForCaller: vi.fn() }));

vi.mock("./booking", () => ({ ...mocks, bookAppointment: vi.fn(), findOpeningsInTransaction: vi.fn(), cancelAppointmentForCaller: vi.fn() }));

import { BookingUnavailableError } from "../availability";
import { rescheduleForCaller } from "./receptionistActions";

const context = { db: {} as never };
const input = { businessId: "biz_1", callerPhone: "+14165550100", appointmentId: "apt_1", startsAt: "2030-01-08T15:00:00.000Z", verificationId: "ver_1", finalConfirmation: true };

beforeEach(() => { vi.clearAllMocks(); });

describe("refused reschedules", () => {
  it("says why a reschedule time isn't bookable", async () => {
    mocks.rescheduleAppointmentForCaller.mockRejectedValue(new BookingUnavailableError("closure", "That appointment time is no longer available."));
    await expect(rescheduleForCaller(context, input)).resolves.toMatchObject({ ok: false, unavailableReason: "closure" });
  });

  it("lets other reschedule errors through", async () => {
    mocks.rescheduleAppointmentForCaller.mockRejectedValue(new Error("database is down"));
    await expect(rescheduleForCaller(context, input)).rejects.toThrow("database is down");
  });
});
