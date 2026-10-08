import { describe, expect, it } from "vitest";
import { appointmentTimesMatch, serviceNamesMatch, storedContactNameMatchesIfPresent, substantiveServiceNameFactMatches } from "./appointmentFacts";
describe("appointment fact verification", () => {
  it("requires the stored caller name when present", () => {
    expect(storedContactNameMatchesIfPresent("Alex Morgan", undefined)).toBe(false);
    expect(storedContactNameMatchesIfPresent("Alex Morgan", "Taylor")).toBe(false);
    expect(storedContactNameMatchesIfPresent("Alex Morgan", "Alex")).toBe(true);
    expect(storedContactNameMatchesIfPresent(undefined, undefined)).toBe(true);
  });

  // A booking saves the name as the receptionist heard it; on staging "Raphael Morency" was saved as "Rafael Morenzi".
  it("matches a caller's name against the spelling a transcript saved, and accented spellings", () => {
    expect(storedContactNameMatchesIfPresent("Rafael Morenzi", "Raphael Morency")).toBe(true);
    expect(storedContactNameMatchesIfPresent("Jonathan Lee", "Jonathon Lee")).toBe(true);
    expect(storedContactNameMatchesIfPresent("Émilie Tremblay", "Emilie Tremblay")).toBe(true);
    expect(storedContactNameMatchesIfPresent("Đorđe Petrović", "Djordje Petrovic")).toBe(true);
    expect(storedContactNameMatchesIfPresent("Mary Smith", "Mark Smith")).toBe(false);
    expect(storedContactNameMatchesIfPresent("Rafael Morenzi", "Raphael Martin")).toBe(false);
    expect(storedContactNameMatchesIfPresent("Rafael Morenzi", "Raphael")).toBe(false);
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
