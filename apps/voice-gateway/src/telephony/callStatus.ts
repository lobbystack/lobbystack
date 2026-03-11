export type NormalizedTwilioCallStatusPayload = {
  callSid: string;
  callStatus: string;
  sequenceNumber?: number | undefined;
  callbackSource?: string | undefined;
  timestamp?: string | undefined;
  durationSeconds?: number | undefined;
};

function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeTwilioCallStatusPayload(
  payload: Record<string, string>,
): NormalizedTwilioCallStatusPayload | null {
  const callSid = normalizeString(payload.CallSid);
  const callStatus = normalizeString(payload.CallStatus)?.toLowerCase();

  if (!callSid || !callStatus) {
    return null;
  }

  const normalized: NormalizedTwilioCallStatusPayload = {
    callSid,
    callStatus,
  };

  const sequenceNumber = normalizeNumber(payload.SequenceNumber);
  const callbackSource = normalizeString(payload.CallbackSource);
  const timestamp = normalizeString(payload.Timestamp);
  const durationSeconds = normalizeNumber(payload.CallDuration);

  if (sequenceNumber !== undefined) {
    normalized.sequenceNumber = sequenceNumber;
  }
  if (callbackSource !== undefined) {
    normalized.callbackSource = callbackSource;
  }
  if (timestamp !== undefined) {
    normalized.timestamp = timestamp;
  }
  if (durationSeconds !== undefined) {
    normalized.durationSeconds = durationSeconds;
  }

  return normalized;
}

export function isTerminalTwilioCallStatus(status: string): boolean {
  switch (status.trim().toLowerCase()) {
    case "busy":
    case "canceled":
    case "completed":
    case "failed":
    case "no-answer":
      return true;
    default:
      return false;
  }
}
