import { describe, expect, it } from "vitest";

import { buildAppointmentNotification } from "./notifications";

const base = {
  businessName: "Ordinacija Javor",
  serviceName: "pregled",
  startsAt: new Date("2026-09-30T12:00:00.000Z"),
  timezone: "Europe/Belgrade",
};

describe("appointment notification copy", () => {
  it("writes Serbian reminders in Latin script with a Latin-script date", () => {
    const message = buildAppointmentNotification({ ...base, kind: "appointment_reminder", locale: "sr" });
    expect(message.subject).toBe("Podsetnik za termin");
    expect(message.body).toMatch(/^Podsetnik od Ordinacija Javor: imate termin za pregled, 30\. sep/);
    expect(`${message.subject} ${message.body}`).not.toMatch(/[Ѐ-ӿ]/);
  });

  it("writes Spanish confirmations with a Spanish date", () => {
    const message = buildAppointmentNotification({ ...base, kind: "appointment_confirmation", locale: "es", timezone: "America/Mexico_City" });
    expect(message.subject).toBe("Cita confirmada");
    expect(message.body).toMatch(/^Ordinacija Javor: confirmamos su cita de pregled para el 30 sept 2026/);
  });

  it("keeps English as the default copy", () => {
    const message = buildAppointmentNotification({ ...base, kind: "appointment_reminder", locale: "en", timezone: "America/New_York" });
    expect(message.body).toBe("Reminder from Ordinacija Javor: your pregled appointment is scheduled for Sep 30, 2026, 8:00 AM.");
  });
});
