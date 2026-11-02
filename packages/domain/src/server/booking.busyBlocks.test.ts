import { expect, it } from "vitest";

import { withoutOwnAppointment } from "./booking";

const at = (time: string) => new Date(`2026-11-02T${time}:00Z`);
const block = { connectionId: "calcom", startsAt: at("12:00"), endsAt: at("13:00") };

it("keeps the time a Cal.com booking holds past its appointment busy", () => {
  expect(withoutOwnAppointment(block, { startsAt: at("12:00"), endsAt: at("12:30") })).toEqual([{ connectionId: "calcom", startsAt: at("12:30"), endsAt: at("13:00") }]);
  expect(withoutOwnAppointment(block, { startsAt: at("12:15"), endsAt: at("12:45") })).toEqual([
    { connectionId: "calcom", startsAt: at("12:00"), endsAt: at("12:15") },
    { connectionId: "calcom", startsAt: at("12:45"), endsAt: at("13:00") },
  ]);
});

it("drops a block the appointment covers and keeps one it doesn't touch", () => {
  expect(withoutOwnAppointment(block, { startsAt: at("12:00"), endsAt: at("13:00") })).toEqual([]);
  expect(withoutOwnAppointment(block, { startsAt: at("14:00"), endsAt: at("14:30") })).toEqual([block]);
  expect(withoutOwnAppointment(block, null)).toEqual([block]);
});
