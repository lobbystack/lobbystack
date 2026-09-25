import { describe, expect, it, vi } from "vitest";

import {
  ABANDON_INTENT_QUESTIONS,
  ABANDON_INTENT_SURVEY_ID,
  captureSurveyDismissed,
  captureSurveyResponse,
  captureSurveyShown,
} from "./abandon-intent-survey";

function client() {
  return { capture: vi.fn() };
}

const [issueQuestion, missingQuestion] = ABANDON_INTENT_QUESTIONS;

describe("abandon intent survey capture", () => {
  it("reports the dialog opening against the survey", () => {
    const posthog = client();
    captureSurveyShown(posthog);
    expect(posthog.capture).toHaveBeenCalledWith("survey shown", expect.objectContaining({ $survey_id: ABANDON_INTENT_SURVEY_ID }));
  });

  it("reports a dismissal", () => {
    const posthog = client();
    captureSurveyDismissed(posthog);
    expect(posthog.capture).toHaveBeenCalledWith("survey dismissed", expect.objectContaining({ $survey_id: ABANDON_INTENT_SURVEY_ID }));
  });

  it("keys each answer to its question so responses reach the survey report", () => {
    const posthog = client();
    expect(captureSurveyResponse({ issue: "The test call failed", missing: "Opening hours" }, posthog)).toBe(true);
    expect(posthog.capture).toHaveBeenCalledWith("survey sent", expect.objectContaining({
      $survey_id: ABANDON_INTENT_SURVEY_ID,
      [`$survey_response_${issueQuestion!.id}`]: "The test call failed",
      [`$survey_response_${missingQuestion!.id}`]: "Opening hours",
    }));
  });

  it("accepts one answer and sends the other blank", () => {
    const posthog = client();
    expect(captureSurveyResponse({ issue: "", missing: "Staff scheduling" }, posthog)).toBe(true);
    expect(posthog.capture).toHaveBeenCalledWith("survey sent", expect.objectContaining({
      [`$survey_response_${issueQuestion!.id}`]: "",
      [`$survey_response_${missingQuestion!.id}`]: "Staff scheduling",
    }));
  });

  it("trims whitespace so a space is not an answer", () => {
    const posthog = client();
    expect(captureSurveyResponse({ issue: "   ", missing: "  " }, posthog)).toBe(false);
    expect(posthog.capture).not.toHaveBeenCalled();
  });
});
