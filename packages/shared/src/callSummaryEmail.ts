/**
 * What a call summary alert email lays out, as the domain stores it on the
 * delivery and the email template reads it. Every value is text, since it
 * travels as template variables; an empty string means "not known", and the
 * email leaves that row out.
 */
export type CallSummaryEmailDetails = {
  /** The recipient's dashboard language, which the email is written in. */
  locale: string;
  businessName: string;
  callerName: string;
  callerPhone: string;
  /** When the call was answered, as an ISO timestamp. */
  startedAt: string;
  /** The business's time zone, which the time is shown in. */
  timezone: string;
  /** Whole seconds, or "" when the call's length isn't known. */
  durationSeconds: string;
  /** What came of the call, when something did. */
  outcome: CallSummaryOutcome | "";
  /** For a booking: when the appointment is, as an ISO timestamp, and its service, if named. */
  bookedAt: string;
  bookedService: string;
  summary: string;
  /** The call in the dashboard. */
  url: string;
};

export type CallSummaryOutcome = "booked" | "transferred";
