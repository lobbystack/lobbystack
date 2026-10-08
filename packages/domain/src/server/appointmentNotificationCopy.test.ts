import { describe, expect, it } from "vitest";

import { buildAppointmentNotification, SMS_OPT_OUT_FOOTER } from "./notifications";
import { estimateSmsSegments } from "./usage";

const base = {
  businessName: "Ordinacija Javor",
  serviceName: "pregled",
  startsAt: new Date("2026-09-30T12:00:00.000Z"),
  timezone: "Europe/Belgrade",
};

// The GSM-7 basic alphabet, without its Greek capitals: 160 characters a segment.
const GSM7 = /^[A-Za-z0-9 @£$¥èéùìòÇØøÅåÆæßÉÄÖÑÜäöñüà§¿¡!"#¤%&'()*+,\-./:;<=>?\n]*$/;
const kinds = ["booking_confirmation", "appointment_reminder", "cancellation_confirmation"];

describe("appointment notification copy", () => {
  it("writes Serbian reminders in Latin script with a Latin-script date", () => {
    const message = buildAppointmentNotification({ ...base, kind: "appointment_reminder", channel: "sms", locale: "sr" });
    expect(message.subject).toBe("Podsetnik za termin");
    expect(message.body).toMatch(/^Podsetnik od Ordinacija Javor: imate termin za pregled, 30\. sep/);
    expect(`${message.subject} ${message.body}`).not.toMatch(/[Ѐ-ӿ]/);
  });

  it("writes Spanish confirmations with a Spanish date", () => {
    const message = buildAppointmentNotification({ ...base, kind: "appointment_confirmation", channel: "sms", locale: "es", timezone: "America/Mexico_City" });
    expect(message.subject).toBe("Cita confirmada");
    expect(message.body).toMatch(/^Ordinacija Javor: confirmamos su cita de pregled para el 30 sept 2026/);
  });

  it.each([
    ["en", "Appointment cancelled", "Ordinacija Javor: your pregled appointment on Sep 30, 2026, 2:00 PM is cancelled."],
    ["fr", "Rendez-vous annulé", "Ordinacija Javor: votre rendez-vous pregled du 30 sept. 2026, 14:00 est annulé."],
    ["es", "Cita cancelada", "Ordinacija Javor: cancelamos su cita de pregled del 30 sept 2026, 14:00."],
    ["sr", "Termin je otkazan", "Ordinacija Javor: otkazali smo termin za pregled, 30. sep 2026. 14:00."],
  ] as const)("writes the %s cancellation text with the appointment's date, in GSM-7", (locale, subject, body) => {
    const message = buildAppointmentNotification({ ...base, kind: "cancellation_confirmation", channel: "sms", locale });
    expect(message).toEqual({ subject, body: `${body} ${SMS_OPT_OUT_FOOTER[locale]}` });
    expect(message.body).toMatch(GSM7);
  });

  it("keeps English as the default copy", () => {
    const message = buildAppointmentNotification({ ...base, kind: "appointment_reminder", channel: "sms", locale: "en", timezone: "America/New_York" });
    expect(message.body).toBe("Reminder from Ordinacija Javor: your pregled appointment is scheduled for Sep 30, 2026, 8:00 AM. Msg & data rates may apply. Reply STOP to opt out or HELP for help.");
  });
});

describe("the opt-out line on appointment texts", () => {
  it.each([
    ["en", "Msg & data rates may apply. Reply STOP to opt out or HELP for help."],
    ["fr", "Des frais de messagerie et de données peuvent s'appliquer. Répondez STOP pour vous désabonner ou HELP pour obtenir de l'aide."],
    ["es", "Pueden aplicarse tarifas de mensajes y datos. Responda STOP para darse de baja o HELP para obtener ayuda."],
    ["sr", "Mogu se naplatiti poruke i prenos podataka. Odgovorite STOP za odjavu ili HELP za informacije."],
  ] as const)("ends every %s text, keeps STOP and HELP in English, and stays in GSM-7 within two segments", (locale, footer) => {
    expect(SMS_OPT_OUT_FOOTER[locale]).toBe(footer);
    for (const kind of kinds) {
      const { body } = buildAppointmentNotification({ ...base, kind, channel: "sms", locale });
      expect(body.endsWith(` ${footer}`)).toBe(true);
      expect(body).toMatch(/\bSTOP\b.*\bHELP\b/);
      expect(body).toMatch(GSM7);
      expect(estimateSmsSegments(body)).toBeLessThanOrEqual(2);
    }
  });

  it("keeps a short English confirmation to one segment", () => {
    const { body } = buildAppointmentNotification({ ...base, kind: "booking_confirmation", channel: "sms", locale: "en", timezone: "America/Toronto" });
    expect(body).toBe("Ordinacija Javor: your pregled appointment is confirmed for Sep 30, 2026, 8:00 AM. Msg & data rates may apply. Reply STOP to opt out or HELP for help.");
    expect(estimateSmsSegments(body)).toBe(1);
  });

  it("leaves it out of emails", () => {
    for (const kind of kinds) {
      const { body } = buildAppointmentNotification({ ...base, kind, channel: "email", locale: "en" });
      expect(body).not.toContain("STOP");
    }
  });
});
