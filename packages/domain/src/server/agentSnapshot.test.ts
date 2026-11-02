import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enqueueOutbox: vi.fn() }));

vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lobbystack/db")>()),
  enqueueOutbox: mocks.enqueueOutbox,
}));

import { enqueueAgentSnapshotRefresh, type AgentSnapshotChange } from "./agentSnapshot";

beforeEach(() => mocks.enqueueOutbox.mockReset());

describe("enqueueAgentSnapshotRefresh", () => {
  const tx = {} as never;

  it.each<AgentSnapshotChange>(["agent_created", "agent_updated", "agent_archived", "channel_moved"])("refreshes the snapshot in the transaction of a %s change", async (change) => {
    await enqueueAgentSnapshotRefresh(tx, { businessId: "biz_1", agentId: "agent_1", change });
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(tx, expect.objectContaining({
      topic: "snapshot.refresh",
      businessId: "biz_1",
      aggregateType: "agent",
      aggregateId: "agent_1",
      dedupeKey: expect.stringMatching(new RegExp(`^agent:agent_1:snapshot:${change}:\\d+$`)),
      payload: { businessId: "biz_1", reason: change },
    }));
  });

  it("keeps a dedupe key the caller names", async () => {
    await enqueueAgentSnapshotRefresh(tx, { businessId: "biz_1", agentId: "agent_1", change: "agent_updated", dedupeKey: "saved-once" });
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(tx, expect.objectContaining({ dedupeKey: "saved-once" }));
  });
});
