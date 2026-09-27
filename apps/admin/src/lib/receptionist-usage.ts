export type UsageSnapshot = {
  receptionists: Array<{ id: string; name: string }>;
  knowledgeOptOuts: Array<{ agentId: string; documentId: string | null; snippetId: string | null }>;
  serviceOptOuts: Array<{ agentId: string; serviceId: string }>;
};

export type ItemRef = { kind: "document"; id: string } | { kind: "snippet"; id: string } | { kind: "service"; id: string };

function optedOut(usage: UsageSnapshot, item: ItemRef): Set<string> {
  if (item.kind === "service") return new Set(usage.serviceOptOuts.filter((row) => row.serviceId === item.id).map((row) => row.agentId));
  return new Set(usage.knowledgeOptOuts.filter((row) => (item.kind === "document" ? row.documentId : row.snippetId) === item.id).map((row) => row.agentId));
}

/** Which receptionists use a shared item. `all` means every one of them. */
export function itemUsedBy(usage: UsageSnapshot, item: ItemRef): { all: boolean; names: string[] } {
  const skipped = optedOut(usage, item);
  const users = usage.receptionists.filter((receptionist) => !skipped.has(receptionist.id));
  return { all: users.length === usage.receptionists.length, names: users.map((receptionist) => receptionist.name) };
}

/** Whether one receptionist uses a shared item (no opt-out row means it does). */
export function receptionistUsesItem(usage: UsageSnapshot, item: ItemRef, agentId: string): boolean {
  return !optedOut(usage, item).has(agentId);
}
