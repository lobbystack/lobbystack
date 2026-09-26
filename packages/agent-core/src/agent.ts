import { stepCountIs, ToolLoopAgent, type LanguageModel, type ToolSet } from "ai";

import { buildAgentInstructions } from "./instructions";
import { createReceptionistTools, type AgentToolContext } from "./tools";

export type ReceptionistAgent = ToolLoopAgent<never, ToolSet>;

export function createReceptionistAgent(input: { model: LanguageModel; context: AgentToolContext }): ReceptionistAgent {
  return new ToolLoopAgent({
    model: input.model,
    instructions: buildAgentInstructions(input.context.snapshot, input.context.channel),
    tools: createReceptionistTools(input.context),
    // One lookup, maybe a second, then the answer. Voice callers are waiting.
    stopWhen: stepCountIs(4),
    temperature: 0.2,
  });
}
