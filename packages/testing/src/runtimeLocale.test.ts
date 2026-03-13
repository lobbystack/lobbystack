import { describe, expect, it } from "vitest";

import {
  buildLocalizedAppointmentNotificationBody,
  classifyRuntimeLocale,
  detectExplicitRuntimeLocaleRequest,
  resolveRuntimeLocale,
} from "../../../convex/lib/runtimeLocale";

describe("runtime locale detection", () => {
  it("classifies clearly French text as French", () => {
    expect(classifyRuntimeLocale("Bonjour, avez-vous un rendez-vous demain à 16h?")).toBe("fr");
  });

  it("classifies clearly English text as English", () => {
    expect(classifyRuntimeLocale("What time do you close on Friday?")).toBe("en");
  });

  it("honors explicit language switch requests", () => {
    expect(detectExplicitRuntimeLocaleRequest("Pouvez-vous répondre en français?")).toBe("fr");
    expect(detectExplicitRuntimeLocaleRequest("Please answer in English.")).toBe("en");
    expect(detectExplicitRuntimeLocaleRequest("Pouvez-vous répondre en anglais ?")).toBe("en");
    expect(detectExplicitRuntimeLocaleRequest("Parlez anglais")).toBe("en");
    expect(detectExplicitRuntimeLocaleRequest("Parlez-vous anglais ?")).toBe("en");
  });

  it("does not treat generic mentions of another language as a switch request", () => {
    expect(detectExplicitRuntimeLocaleRequest("Avez-vous des services en anglais ?")).toBe(null);
    expect(classifyRuntimeLocale("Avez-vous des services en anglais ?")).not.toBe("en");
  });

  it("treats short ambiguous messages as unknown", () => {
    expect(classifyRuntimeLocale("bonjour")).toBe("unknown");
    expect(classifyRuntimeLocale("merci")).toBe("unknown");
    expect(classifyRuntimeLocale("ok")).toBe("unknown");
  });

  it("falls back to English when a stored runtime locale is missing", () => {
    expect(resolveRuntimeLocale(undefined)).toBe("en");
    expect(resolveRuntimeLocale(null)).toBe("en");
  });

  it("keeps timezone information in localized appointment notifications", () => {
    expect(
      buildLocalizedAppointmentNotificationBody({
        kind: "booking_confirmation",
        serviceName: "Initial Consultation",
        startsAt: "2026-03-17T14:30:00.000Z",
        timezone: "America/Toronto",
        locale: "fr",
      }),
    ).toContain("(America/Toronto)");
    expect(
      buildLocalizedAppointmentNotificationBody({
        kind: "appointment_reminder",
        serviceName: "Initial Consultation",
        startsAt: "2026-03-17T14:30:00.000Z",
        timezone: "America/Toronto",
        locale: "en",
      }),
    ).toContain("(America/Toronto)");
  });
});
