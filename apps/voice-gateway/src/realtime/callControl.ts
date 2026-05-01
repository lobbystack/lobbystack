export const NORMAL_IDLE_TIMEOUT_MS = 30_000;
export const SILENCE_TIMEOUT_MS = 75_000;
export const HOLD_EXPIRY_GRACE_MS = 30_000;
export const MAX_SINGLE_HOLD_SECONDS = 120;
export const MAX_CUMULATIVE_HOLD_SECONDS = 300;

export type EndCallReason = "caller_finished" | "abuse" | "silence_timeout" | "spam";
export type EndCallSeverity = "borderline" | "severe";

export type EndCallRequest = {
  reason: EndCallReason;
  message: string;
  severity?: EndCallSeverity;
};

export type CallInactivityState = {
  silenceWindowStartedAtMs: number | null;
  silenceCheckInSent: boolean;
  activeHoldExpiresAtMs: number | null;
  holdExpiryCheckInSentAtMs: number | null;
  holdSecondsUsed: number;
};

export type CallInactivityAction =
  | { kind: "none"; nextCheckInMs?: number }
  | { kind: "hold_expired_check_in" }
  | { kind: "silence_timeout" };

export type HoldGrantResult =
  | {
      ok: true;
      requestedDurationSeconds: number;
      grantedDurationSeconds: number;
      remainingHoldSeconds: number;
      capped: boolean;
      reason: string;
    }
  | {
      ok: false;
      requestedDurationSeconds: number;
      grantedDurationSeconds: 0;
      remainingHoldSeconds: 0;
      capped: true;
      reason: string;
      error: "hold_limit_reached";
    };

export function getDispositionForEndCall(reason: EndCallReason): string {
  if (reason === "abuse") {
    return "abuse_ended";
  }

  if (reason === "spam") {
    return "spam_ended";
  }

  return reason;
}

export function shouldSystemBlockForEndCall(reason: EndCallReason): boolean {
  return reason === "abuse";
}

export function createCallInactivityState(): CallInactivityState {
  return {
    silenceWindowStartedAtMs: null,
    silenceCheckInSent: false,
    activeHoldExpiresAtMs: null,
    holdExpiryCheckInSentAtMs: null,
    holdSecondsUsed: 0,
  };
}

export function markCallerActivity(
  state: CallInactivityState,
): CallInactivityState {
  return {
    ...state,
    silenceWindowStartedAtMs: null,
    silenceCheckInSent: false,
    activeHoldExpiresAtMs: null,
    holdExpiryCheckInSentAtMs: null,
  };
}

export function markAssistantResponseDone(
  state: CallInactivityState,
  nowMs: number,
): CallInactivityState {
  if (state.activeHoldExpiresAtMs !== null) {
    return state;
  }

  if (state.silenceCheckInSent || state.holdExpiryCheckInSentAtMs !== null) {
    return state;
  }

  return {
    ...state,
    silenceWindowStartedAtMs: nowMs,
  };
}

export function markRealtimeIdleTimeout(
  state: CallInactivityState,
  nowMs: number,
): CallInactivityState {
  if (
    state.activeHoldExpiresAtMs !== null &&
    nowMs < state.activeHoldExpiresAtMs
  ) {
    return state;
  }

  return {
    ...state,
    silenceCheckInSent: true,
  };
}

export function grantCallHold(
  state: CallInactivityState,
  input: {
    requestedDurationSeconds: number;
    reason: string;
    nowMs: number;
  },
): {
  state: CallInactivityState;
  result: HoldGrantResult;
} {
  const remainingHoldSeconds = Math.max(
    0,
    MAX_CUMULATIVE_HOLD_SECONDS - state.holdSecondsUsed,
  );
  const grantedDurationSeconds = Math.min(
    input.requestedDurationSeconds,
    MAX_SINGLE_HOLD_SECONDS,
    remainingHoldSeconds,
  );

  if (grantedDurationSeconds <= 0) {
    return {
      state,
      result: {
        ok: false,
        requestedDurationSeconds: input.requestedDurationSeconds,
        grantedDurationSeconds: 0,
        remainingHoldSeconds: 0,
        capped: true,
        reason: input.reason,
        error: "hold_limit_reached",
      },
    };
  }

  const nextState: CallInactivityState = {
    ...state,
    silenceWindowStartedAtMs: null,
    silenceCheckInSent: false,
    activeHoldExpiresAtMs: input.nowMs + grantedDurationSeconds * 1000,
    holdExpiryCheckInSentAtMs: null,
    holdSecondsUsed: state.holdSecondsUsed + grantedDurationSeconds,
  };

  return {
    state: nextState,
    result: {
      ok: true,
      requestedDurationSeconds: input.requestedDurationSeconds,
      grantedDurationSeconds,
      remainingHoldSeconds: Math.max(
        0,
        remainingHoldSeconds - grantedDurationSeconds,
      ),
      capped: grantedDurationSeconds < input.requestedDurationSeconds,
      reason: input.reason,
    },
  };
}

export function markHoldExpiryCheckInSent(
  state: CallInactivityState,
  nowMs: number,
): CallInactivityState {
  return {
    ...state,
    activeHoldExpiresAtMs: null,
    holdExpiryCheckInSentAtMs: nowMs,
    silenceWindowStartedAtMs: null,
    silenceCheckInSent: true,
  };
}

export function getCallInactivityAction(
  state: CallInactivityState,
  nowMs: number,
): CallInactivityAction {
  if (state.activeHoldExpiresAtMs !== null) {
    if (nowMs >= state.activeHoldExpiresAtMs) {
      return { kind: "hold_expired_check_in" };
    }

    return {
      kind: "none",
      nextCheckInMs: state.activeHoldExpiresAtMs - nowMs,
    };
  }

  if (state.holdExpiryCheckInSentAtMs !== null) {
    const timeoutAtMs = state.holdExpiryCheckInSentAtMs + HOLD_EXPIRY_GRACE_MS;
    if (nowMs >= timeoutAtMs) {
      return { kind: "silence_timeout" };
    }

    return {
      kind: "none",
      nextCheckInMs: timeoutAtMs - nowMs,
    };
  }

  if (state.silenceWindowStartedAtMs !== null) {
    const timeoutAtMs = state.silenceWindowStartedAtMs + SILENCE_TIMEOUT_MS;
    if (nowMs >= timeoutAtMs) {
      return { kind: "silence_timeout" };
    }

    return {
      kind: "none",
      nextCheckInMs: timeoutAtMs - nowMs,
    };
  }

  return { kind: "none" };
}
