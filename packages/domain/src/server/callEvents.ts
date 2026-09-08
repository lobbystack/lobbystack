type CallRow = { status: string; disposition?: string | null; startedAt: string; endedAt?: string | null; transferState?: string | null };

export function resolveCallStatus(
  call: CallRow,
): "in_progress" | "completed" | "failed" {
  if (call.status === "in_progress" || call.status === "open") {
    return "in_progress";
  }

  const disposition = call.disposition?.trim().toLowerCase() ?? "";
  if (
    disposition.includes("failed") ||
    disposition.includes("busy") ||
    disposition.includes("canceled") ||
    disposition.includes("cancelled") ||
    disposition.includes("no_answer") ||
    disposition.includes("missed") ||
    disposition.includes("stream_start_failed") ||
    disposition.includes("openai_handshake_failed")
  ) {
    return "failed";
  }

  return "completed";
}

export function isContactBlockedCall(call: { disposition?: string | null }): boolean {
  return call.disposition?.trim().toLowerCase().includes("contact_blocked") ?? false;
}

export function callReachedConnectedStep(call: CallRow): boolean {
  if (call.status === "in_progress") {
    return true;
  }

  if (call.status === "open") {
    return false;
  }

  if (isContactBlockedCall(call)) {
    return false;
  }

  const disposition = call.disposition?.trim().toLowerCase() ?? "";
  if (
    disposition.includes("busy") ||
    disposition.includes("canceled") ||
    disposition.includes("cancelled") ||
    disposition.includes("no_answer") ||
    disposition.includes("missed")
  ) {
    return false;
  }

  return true;
}

type CallEvent = {
  key: string;
  labelKey: string;
  timestamp: string | null;
  reached: boolean;
  isFinal: boolean;
  failed: boolean;
};

export function buildCallEvents(call: CallRow): CallEvent[] {
  const events: CallEvent[] = [];
  const status = resolveCallStatus(call);
  const reachedConnectedStep = callReachedConnectedStep(call);

  events.push({
    key: "received",
    labelKey: "detail.events.received",
    timestamp: call.startedAt,
    reached: true,
    isFinal: false,
    failed: false,
  });

  if (isContactBlockedCall(call)) {
    events.push({
      key: "blocked",
      labelKey: "detail.events.blocked",
      timestamp: call.endedAt ?? call.startedAt,
      reached: true,
      isFinal: true,
      failed: true,
    });
    return events;
  }

  events.push({
    key: "connected",
    labelKey: "detail.events.connected",
    timestamp: reachedConnectedStep ? call.startedAt : null,
    reached: reachedConnectedStep,
    isFinal: false,
    failed: false,
  });

  if (
    call.transferState &&
    call.transferState !== "none" &&
    call.transferState !== "idle"
  ) {
    events.push({
      key: "transferred",
      labelKey: "detail.events.transferred",
      timestamp: null,
      reached: true,
      isFinal: false,
      failed: call.transferState.includes("failed") ||
        call.transferState.includes("busy"),
    });
  }

  if (status === "failed") {
    events.push({
      key: "failed",
      labelKey: "detail.events.failed",
      timestamp: call.endedAt ?? null,
      reached: true,
      isFinal: true,
      failed: true,
    });
  } else {
    events.push({
      key: "completed",
      labelKey: "detail.events.completed",
      timestamp: call.endedAt ?? null,
      reached: status === "completed",
      isFinal: true,
      failed: false,
    });
  }

  return events;
}

