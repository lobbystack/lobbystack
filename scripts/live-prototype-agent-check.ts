// Runs the agent core the way the live call controller does, without audio,
// and prints each answer with its latency. Local only.
const CONVERSATIONS = [
  ["Caller: Hi, are you open on Saturday?"],
  ["Caller: My kitchen sink is blocked. Can someone come for drain cleaning next Tuesday morning?"],
  ["Caller: Can you ask the owner to call me back about a quote? I'm Sam Lee, 416 555 0134."],
];

async function main(): Promise<void> {
  const businessId = process.env.LIVE_PROTOTYPE_TEST_BUSINESS_ID;
  if (!businessId) throw new Error("Run scripts/live-prototype-seed.ts first.");
  const db = await import("@lobbystack/db");
  const { getCachedBusinessSnapshot } = await import("@lobbystack/domain");
  const { createAgentModel, createReceptionistAgent } = await import("@lobbystack/agent-core");
  const worker = db.createDatabaseClient("lobbystack_worker");
  try {
    const domain = { db: worker.db };
    const snapshot = await getCachedBusinessSnapshot(domain, { businessId });
    const model = createAgentModel();
    if (!snapshot || !model) throw new Error("Snapshot or model missing.");
    const agent = createReceptionistAgent({ model, context: { domain, snapshot, channel: "voice", callerPhone: "+14165550134" } });
    for (const turns of CONVERSATIONS) {
      const startedAt = performance.now();
      const result = await agent.generate({
        prompt: `Conversation so far:\n${turns.join("\n")}\n\nThe voice model handed you the caller's latest request. Handle it and reply with what the receptionist should say next.`,
      });
      console.log(JSON.stringify({
        request: turns.at(-1),
        ms: Math.round(performance.now() - startedAt),
        tools: result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)),
        answer: result.text,
      }, null, 2));
    }
  } finally {
    await worker.pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
