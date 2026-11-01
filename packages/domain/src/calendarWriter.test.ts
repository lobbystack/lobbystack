import { expect, it } from "vitest";

import { pickCalendarWriter } from "./calendarWriter";

const google = { id: "b-google", provider: "google", staffId: null, selectedCalendarId: "team@group.calendar.google.com" };
const calcom = { id: "c-calcom", provider: "calcom", staffId: null, selectedCalendarId: "42" };

it("writes a business-wide appointment to Cal.com when Google is connected too", () => {
  expect(pickCalendarWriter([google, calcom])).toBe(calcom);
  expect(pickCalendarWriter([calcom, google])).toBe(calcom);
});

it("keeps writing to Google until an event type is picked in Cal.com", () => {
  expect(pickCalendarWriter([google, { ...calcom, selectedCalendarId: null }])).toBe(google);
});

it("puts a staff member's own calendar ahead of the business's, even without a calendar picked", () => {
  const own = { id: "z-own", provider: "google", staffId: "staff", selectedCalendarId: null };
  expect(pickCalendarWriter([calcom, google, own])).toBe(own);
});

it("settles a tie on the oldest id", () => {
  expect(pickCalendarWriter([{ ...google, id: "b" }, { ...google, id: "a" }])?.id).toBe("a");
  expect(pickCalendarWriter([])).toBeUndefined();
});
