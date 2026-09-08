import { describe, expect, it } from "vitest";
import { appointmentTimesMatch, serviceNamesMatch, storedContactNameMatchesIfPresent, substantiveServiceNameFactMatches } from "./appointmentFacts";
describe("appointment fact verification", () => {
  it("requires the stored caller name when present", () => {
    expect(storedContactNameMatchesIfPresent("Alex Morgan", undefined)).toBe(false);
    expect(storedContactNameMatchesIfPresent("Alex Morgan", "Taylor")).toBe(false);
    expect(storedContactNameMatchesIfPresent("Alex Morgan", "Alex")).toBe(true);
    expect(storedContactNameMatchesIfPresent(undefined, undefined)).toBe(true);
  });
  it("matches localized service facts and rejects generic fragments", () => {
    const service = { name: "Dental examination", slug: "dental-exam", localizedNames: { fr: "Examen dentaire" } };
    expect(serviceNamesMatch(service, "Examen dentaire")).toBe(true);
    expect(substantiveServiceNameFactMatches(service, "exam")).toBe(true);
    expect(substantiveServiceNameFactMatches(service, "de")).toBe(false);
    expect(serviceNamesMatch(service, "Haircut")).toBe(false);
  });
  it("matches absolute and spoken local times within the reference tolerance", () => {
    const appointment = { startsAt: "2026-09-04T14:30:00Z", timezone: "America/Toronto" };
    expect(appointmentTimesMatch(appointment, "2026-09-04T14:45:00Z")).toBe(true);
    expect(appointmentTimesMatch(appointment, "Friday at 10:30 am")).toBe(true);
    expect(appointmentTimesMatch(appointment, "Friday at 15:30")).toBe(false);
    expect(appointmentTimesMatch(appointment, "Thursday at 10:30 am")).toBe(false);
    expect(appointmentTimesMatch(appointment, "morning")).toBe(false);
  });
});
