import { expect, it } from "vitest";

import { calcomEventTypeWarnings } from "./calcomEventTypes";

const weekdays = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, openMinutes: 9 * 60, closeMinutes: 17 * 60 }));
const schedule = (startTime: string, endTime: string, days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], timeZone = "America/Toronto") => ({ timeZone, availability: [{ days, startTime, endTime }] });

it("has nothing to say about an event type that books every service length when the business is open", () => {
  expect(calcomEventTypeWarnings({ eventType: { lengths: [30, 45, 60], smsReminders: false }, serviceDurations: [30, 60, 30], hours: weekdays, timezone: "America/Toronto", schedule: schedule("08:00", "18:00") })).toEqual([]);
});

it("names the service lengths the event type can't book and an attached SMS workflow", () => {
  expect(calcomEventTypeWarnings({ eventType: { lengths: [30], smsReminders: true }, serviceDurations: [90, 30, 45], hours: [], timezone: "UTC", schedule: null })).toEqual([
    { code: "missing_lengths", lengths: [45, 90] },
    { code: "sms_reminders" },
  ]);
});

it("names the days the schedule leaves open hours out", () => {
  const hours = [...weekdays, { dayOfWeek: 6, openMinutes: 10 * 60, closeMinutes: 14 * 60 }];
  expect(calcomEventTypeWarnings({ eventType: { lengths: [30], smsReminders: false }, serviceDurations: [30], hours, timezone: "America/Toronto", schedule: schedule("09:00", "16:00") })).toEqual([{ code: "narrower_availability", days: [1, 2, 3, 4, 5, 6] }]);
});

it("compares hours across time zones and treats 23:59 as the end of the day", () => {
  // 9:00 to 17:00 in Toronto is 14:00 to 22:00 in UTC in January.
  expect(calcomEventTypeWarnings({ eventType: { lengths: [30], smsReminders: false }, serviceDurations: [30], hours: weekdays, timezone: "America/Toronto", schedule: schedule("13:00", "23:59", undefined, "UTC") })).toEqual([]);
  expect(calcomEventTypeWarnings({ eventType: { lengths: [30], smsReminders: false }, serviceDurations: [30], hours: weekdays, timezone: "America/Toronto", schedule: schedule("15:00", "23:59", undefined, "UTC") })).toEqual([{ code: "narrower_availability", days: [1, 2, 3, 4, 5] }]);
  // Open until 21:00 in Toronto runs past midnight in UTC, onto the next day's schedule.
  const late = [{ dayOfWeek: 1, openMinutes: 18 * 60, closeMinutes: 21 * 60 }];
  expect(calcomEventTypeWarnings({ eventType: { lengths: [30], smsReminders: false }, serviceDurations: [30], hours: late, timezone: "America/Toronto", schedule: { timeZone: "UTC", availability: [{ days: ["Monday"], startTime: "20:00", endTime: "00:00" }, { days: ["Tuesday"], startTime: "00:00", endTime: "03:00" }] } })).toEqual([]);
});
