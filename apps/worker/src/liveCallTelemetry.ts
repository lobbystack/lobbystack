import type { DelegationTiming, LiveCallSummary } from "@lobbystack/agent-core";
import { LIVE_CALL_PROVIDER, recordProductEvent, type DomainContext } from "@lobbystack/domain";
import { getPostHogDistinctIdForBusinessSystem, percentileMs, type TelemetryProperties } from "@lobbystack/telemetry";

export type LiveCallTelemetryContext = {
  businessId: string;
  callId: string;
  channel: "voice" | "web_voice";
  conversationId?: string;
};

function record(domain: DomainContext, call: LiveCallTelemetryContext, name: "voice.delegation_completed" | "voice.call_latency_recorded", properties: TelemetryProperties): void {
  // Latency telemetry is best-effort: it runs off the call's hot path and a
  // failure must never affect the call.
  try {
    void recordProductEvent(domain, {
      name,
      businessId: call.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(call.businessId),
      actorType: "worker",
      properties: {
        callId: call.callId,
        channel: call.channel,
        provider: LIVE_CALL_PROVIDER,
        ...(call.conversationId ? { conversationId: call.conversationId } : {}),
        ...properties,
      },
    }).catch(() => undefined);
  } catch {
    // Ignore.
  }
}

/** One delegated request the receptionist agent answered. Carries timings and tool names only. */
export function recordLiveDelegation(domain: DomainContext, call: LiveCallTelemetryContext, timing: DelegationTiming): void {
  record(domain, call, "voice.delegation_completed", {
    agentMs: timing.agentMs,
    totalMs: timing.totalMs,
    tools: [...new Set(timing.tools)],
    toolCount: timing.tools.length,
    failed: timing.failed,
  });
}

/** One summary per call of what the caller heard and how long delegations took. */
export function recordLiveCallLatency(domain: DomainContext, call: LiveCallTelemetryContext, summary: LiveCallSummary): void {
  const latency = summary.latency;
  const answers = latency?.answerGapsMs ?? [];
  const delegationTotals = summary.delegations.map((item) => item.totalMs);
  const optional = (key: string, value: number | undefined) => (value !== undefined ? { [key]: value } : {});
  record(domain, call, "voice.call_latency_recorded", {
    ...(latency?.greetedFirst && latency.firstSpeechMs !== undefined ? { greetingMs: latency.firstSpeechMs } : {}),
    ...optional("firstSpeechMs", latency?.firstSpeechMs),
    greetedFirst: latency?.greetedFirst ?? false,
    speechTimingSource: latency?.speechSource ?? "none",
    answerCount: answers.length,
    ...optional("answerP50Ms", percentileMs(answers, 50)),
    ...optional("answerP90Ms", percentileMs(answers, 90)),
    ...optional("answerMaxMs", percentileMs(answers, 100)),
    delegationCount: summary.delegations.length,
    delegationFailedCount: summary.delegations.filter((item) => item.failed).length,
    ...optional("delegationP50TotalMs", percentileMs(delegationTotals, 50)),
    ...optional("delegationMaxTotalMs", percentileMs(delegationTotals, 100)),
    durationMs: summary.durationMs,
  });
}
