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

  it.each([
    ["en", "Appointment cancelled", "Ordinacija Javor: your pregled appointment on Sep 30, 2026, 2:00 PM is cancelled."],
    ["fr", "Rendez-vous annulé", "Ordinacija Javor: votre rendez-vous pregled du 30 sept. 2026, 14:00 est annulé."],
    ["es", "Cita cancelada", "Ordinacija Javor: cancelamos su cita de pregled del 30 sept 2026, 14:00."],
    ["sr", "Termin je otkazan", "Ordinacija Javor: otkazali smo termin za pregled, 30. sep 2026. 14:00."],
  ] as const)("writes the %s cancellation text with the appointment's date, in GSM-7", (locale, subject, body) => {
    const message = buildAppointmentNotification({ ...base, kind: "cancellation_confirmation", locale });
    expect(message).toEqual({ subject, body });
    // The GSM-7 basic alphabet, without its Greek capitals: one 160-character segment.
    expect(message.body).toMatch(/^[A-Za-z0-9 @£$¥èéùìòÇØøÅåÆæßÉÄÖÑÜäöñüà§¿¡!"#¤%&'()*+,\-./:;<=>?\n]*$/);
  });

  it("keeps English as the default copy", () => {
    const message = buildAppointmentNotification({ ...base, kind: "appointment_reminder", locale: "en", timezone: "America/New_York" });
    expect(message.body).toBe("Reminder from Ordinacija Javor: your pregled appointment is scheduled for Sep 30, 2026, 8:00 AM.");
  });
});
