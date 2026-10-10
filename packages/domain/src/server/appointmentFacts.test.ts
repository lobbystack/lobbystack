import { describe, expect, it } from "vitest";
import { appointmentTimesMatch, matchServiceName, personNamesMatch, serviceNamesMatch, substantiveServiceNameFactMatches } from "./appointmentFacts";
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
  // The agent passes the time the caller said without an offset. Read in the server's zone (UTC on Railway),
  // 3 PM Toronto became 11 AM and never matched; the business's zone has to decide it.
  it("reads a time without an offset in the appointment's zone, whatever the server's zone", () => {
    const tokyo = { startsAt: "2026-10-09T06:00:00.000Z", timezone: "Asia/Tokyo" };
    expect(appointmentTimesMatch(tokyo, "2026-10-09T15:00")).toBe(true);
    expect(appointmentTimesMatch(tokyo, "2026-10-09 15:00")).toBe(true);
    expect(appointmentTimesMatch(tokyo, "2026-10-09T15:00Z")).toBe(false);
    const toronto = { startsAt: "2026-10-09T19:00:00.000Z", timezone: "America/Toronto" };
    expect(appointmentTimesMatch(toronto, "2026-10-09T15:00")).toBe(true);
    expect(appointmentTimesMatch(toronto, "2026-10-09T11:00")).toBe(false);
  });

  it("matches absolute and spoken local times within the reference tolerance", () => {
    const appointment = { startsAt: "2026-09-04T14:30:00Z", timezone: "America/Toronto" };
    expect(appointmentTimesMatch(appointment, "2026-09-04T14:45:00Z")).toBe(true);
    expect(appointmentTimesMatch(appointment, "Friday at 10:30 am")).toBe(true);
    expect(appointmentTimesMatch(appointment, "Friday at 15:30")).toBe(false);
    expect(appointmentTimesMatch(appointment, "Thursday at 10:30 am")).toBe(false);
    expect(appointmentTimesMatch(appointment, "morning")).toBe(false);
  });

  it("picks the one service a caller's words name", () => {
    const services = [
      { id: "cut", name: "Haircut", slug: "haircut", localizedNames: { fr: "Coupe" } },
      { id: "kids", name: "Kids haircut", slug: "kids-haircut" },
      { id: "beard", name: "Beard trim", slug: "beard-trim" },
    ];
    // An exact name, slug or localized name wins over a longer name that contains it.
    expect(matchServiceName(services, "haircut")?.id).toBe("cut");
    expect(matchServiceName(services, "COUPE")?.id).toBe("cut");
    expect(matchServiceName(services, "beard-trim")?.id).toBe("beard");
    expect(matchServiceName(services, "kids")?.id).toBe("kids");
    // Words that fit several services, or none, name nothing. SQL wildcards are plain text.
    expect(matchServiceName(services, "haircut and beard trim")).toBeUndefined();
    expect(matchServiceName(services, "%")).toBeUndefined();
    expect(matchServiceName(services, "h_ircut")).toBeUndefined();
  });
});
