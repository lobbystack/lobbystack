export type CallOutcomeRecord = {
  status: string;
  disposition?: string;
};

export type TerminalTwilioCallReconciliationFields = {
  endedAt: string;
  status?: string;
  disposition?: string;
};

const TERMINAL_TWILIO_CALL_STATUSES = new Set([
  "busy",
  "canceled",
  "completed",
  "failed",
  "no-answer",
]);

export function normalizeTwilioCallStatus(status: string): string {
  return status.trim().toLowerCase();
}

export function isTerminalTwilioCallStatus(status: string): boolean {
  return TERMINAL_TWILIO_CALL_STATUSES.has(normalizeTwilioCallStatus(status));
}

export function mapTwilioCallStatusToDisposition(status: string): string {
  switch (normalizeTwilioCallStatus(status)) {
    case "busy":
      return "call_busy";
    case "canceled":
      return "call_canceled";
    case "completed":
      return "call_completed";
    case "failed":
      return "call_failed";
    case "no-answer":
      return "call_no_answer";
    default:
      return "call_unknown";
  }
}

function isGenericCallDisposition(disposition: string | undefined): boolean {
  return disposition?.startsWith("call_") ?? false;
}

export function isNormalizableRuntimeDisposition(
  disposition: string | undefined,
): boolean {
  return disposition === "stream_stopped" || disposition === "twilio_socket_closed";
}

export function shouldPreserveSpecificCallOutcome(
  call: CallOutcomeRecord,
): boolean {
  return (
    call.status === "transferred" ||
    call.disposition?.startsWith("transfer_") === true ||
    (call.disposition !== undefined &&
      !isGenericCallDisposition(call.disposition) &&
      !isNormalizableRuntimeDisposition(call.disposition))
  );
}

export function getTerminalTwilioCallReconciliationFields(
  call: CallOutcomeRecord,
  input: {
    callStatus: string;
    providerUpdatedAt: string;
  },
): TerminalTwilioCallReconciliationFields {
  const fields: TerminalTwilioCallReconciliationFields = {
    endedAt: input.providerUpdatedAt,
  };

  if (!shouldPreserveSpecificCallOutcome(call)) {
    fields.status = "completed";
    fields.disposition = mapTwilioCallStatusToDisposition(input.callStatus);
  }

  return fields;
}
