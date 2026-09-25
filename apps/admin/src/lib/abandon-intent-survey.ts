import posthog from "posthog-js";

/**
 * The survey lives in PostHog so its responses land in the survey report, but
 * the app draws it, so it can be centred and themed like the rest of the
 * dashboard. These are PostHog's own reserved event and property names; they
 * sit outside the product taxonomy on purpose.
 *
 * https://posthog.com/docs/surveys/implementing-custom-surveys
 */
export const ABANDON_INTENT_SURVEY_ID = "01a0da79-bdf8-0000-5f6a-f64d7aa4fd2a";

export const ABANDON_INTENT_QUESTIONS = [
  { id: "a3d95312-4c6b-4d47-aba6-cc3e55025e96", key: "issue" },
  { id: "6fe13af2-ec79-4962-92a0-de1d9e2b9ba6", key: "missing" },
] as const;

export type AbandonIntentAnswers = { issue: string; missing: string };

type Capture = Pick<typeof posthog, "capture">;

function surveyProperties(): Record<string, unknown> {
  return {
    $survey_id: ABANDON_INTENT_SURVEY_ID,
    $survey_name: "Before you go",
  };
}

export function captureSurveyShown(client: Capture = posthog): void {
  client.capture("survey shown", surveyProperties());
}

export function captureSurveyDismissed(client: Capture = posthog): void {
  client.capture("survey dismissed", surveyProperties());
}

/**
 * Returns false when both answers are blank, so closing an untouched dialog is
 * a dismissal rather than an empty response.
 */
export function captureSurveyResponse(answers: AbandonIntentAnswers, client: Capture = posthog): boolean {
  const trimmed = { issue: answers.issue.trim(), missing: answers.missing.trim() };
  if (!trimmed.issue && !trimmed.missing) return false;
  const responses: Record<string, unknown> = {};
  for (const question of ABANDON_INTENT_QUESTIONS) {
    responses[`$survey_response_${question.id}`] = trimmed[question.key];
  }
  client.capture("survey sent", {
    ...surveyProperties(),
    ...responses,
    $survey_questions: ABANDON_INTENT_QUESTIONS.map(question => ({ id: question.id })),
    $survey_completed: true,
  });
  return true;
}
