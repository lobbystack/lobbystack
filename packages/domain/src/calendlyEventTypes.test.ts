import { expect, it } from "vitest";

import { calendlyEventTypeWarnings } from "./calendlyEventTypes";

const eventType = { lengthInMinutes: 30, blockingQuestions: [], detailsQuestion: true, videoOnly: false };

it("has nothing to say about an event type that fits", () => {
  expect(calendlyEventTypeWarnings({ eventType, serviceDurations: [30, 30] })).toEqual([]);
});

it("lists what to fix, the blocking question first", () => {
  expect(calendlyEventTypeWarnings({ eventType: { ...eventType, blockingQuestions: ["Which clinic?"], detailsQuestion: false, videoOnly: true }, serviceDurations: [60, 30, 45, 60] })).toEqual([
    { code: "required_questions", questions: ["Which clinic?"] },
    { code: "missing_lengths", lengths: [45, 60] },
    { code: "no_details_question" },
    { code: "video_location" },
  ]);
});
