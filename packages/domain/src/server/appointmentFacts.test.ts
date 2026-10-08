import { describe, expect, it } from "vitest";
import { appointmentTimesMatch, personNamesMatch, serviceNamesMatch, substantiveServiceNameFactMatches } from "./appointmentFacts";
describe("appointment fact verification", () => {
  it("matches a name only when both sides have one", () => {
    expect(personNamesMatch("Alex Morgan", undefined)).toBe(false);
    expect(personNamesMatch("Alex Morgan", "Taylor")).toBe(false);
    expect(personNamesMatch("Alex Morgan", "Alex")).toBe(true);
    expect(personNamesMatch(undefined, undefined)).toBe(false);
  });

  // A booking saves the name as the receptionist heard it; on staging "Raphael Morency" was saved as "Rafael Morenzi".
  it("matches a caller's name against the spelling a transcript saved, and accented spellings", () => {
    expect(personNamesMatch("Rafael Morenzi", "Raphael Morency")).toBe(true);
    expect(personNamesMatch("Jonathan Lee", "Jonathon Lee")).toBe(true);
    expect(personNamesMatch("Émilie Tremblay", "Emilie Tremblay")).toBe(true);
    expect(personNamesMatch("Đorđe Petrović", "Djordje Petrovic")).toBe(true);
    // One part is enough: the same surname comes back spelled three ways across calls.
    expect(personNamesMatch("Rafael Morenzi", "Rafael Marancy")).toBe(true);
    expect(personNamesMatch("Rafael Morenzi", "Raphael")).toBe(true);
    expect(personNamesMatch("Mary Smith", "Mark Jones")).toBe(false);
    expect(personNamesMatch("Rafael Morenzi", "Taylor Brooks")).toBe(false);
    expect(personNamesMatch("Milan Obrenovic", "%")).toBe(false);
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
