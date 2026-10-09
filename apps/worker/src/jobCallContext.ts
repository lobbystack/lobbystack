import type { CallContext } from "@lobbystack/telemetry/node";

/** The business and call a job or outbox message works on, from its business ID and payload. */
export function jobCallContext(job: { businessId?: string | null; payload: unknown }): CallContext {
  const payload = job.payload && typeof job.payload === "object" ? job.payload as Record<string, unknown> : {};
  const { callId, sessionId } = payload;
  return {
    ...(job.businessId ? { businessId: job.businessId } : {}),
    ...(typeof callId === "string" && callId ? { callId } : {}),
    ...(typeof sessionId === "string" && sessionId ? { sessionId } : {}),
  };
}
