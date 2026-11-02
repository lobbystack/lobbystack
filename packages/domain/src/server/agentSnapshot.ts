import { enqueueOutbox, type DatabaseTransaction } from "@lobbystack/db";

export type AgentSnapshotChange = "agent_created" | "agent_updated" | "agent_archived" | "channel_moved";

/**
 * Rebuilds the business snapshot after a change to an agent or to which agent a
 * channel answers as. Call it in the transaction that makes the change. Calls
 * read agents only from the snapshot, and an agent id missing from it costs a
 * refresh while the caller hears ringing. Pass dedupeKey to refresh once per
 * saved version; by default each change refreshes.
 */
export async function enqueueAgentSnapshotRefresh(
  tx: DatabaseTransaction,
  input: { businessId: string; agentId: string; change: AgentSnapshotChange; dedupeKey?: string },
): Promise<void> {
  await enqueueOutbox(tx, {
    topic: "snapshot.refresh",
    businessId: input.businessId,
    aggregateType: "agent",
    aggregateId: input.agentId,
    dedupeKey: input.dedupeKey ?? `agent:${input.agentId}:snapshot:${input.change}:${Date.now()}`,
    payload: { businessId: input.businessId, reason: input.change },
  });
}
