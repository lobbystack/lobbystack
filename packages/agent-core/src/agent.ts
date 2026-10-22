import { stepCountIs, ToolLoopAgent, type LanguageModel, type StopCondition, type ToolSet } from "ai";

import { buildAgentInstructions } from "./instructions";
import { directToolAnswer } from "./live/directAnswer";
import { createReceptionistTools, type AgentToolContext } from "./tools";

export type ReceptionistAgent = ToolLoopAgent<never, ToolSet>;

/**
 * Website chat's cap on each model step's output, so no reply runs long even
 * when a visitor talks the model past its instructions. OpenAI counts
 * reasoning tokens toward it, so it leaves room for high reasoning; the
 * instructions keep the visible reply to about 100 words.
 */
export const WEB_CHAT_MAX_OUTPUT_TOKENS = 4_000;

export function createReceptionistAgent(input: {
  model: LanguageModel;
  context: AgentToolContext;
  extraInstructions?: string;
  /**
   * Live calls only: stop as soon as a step's tool results can be spoken as
   * they are (see live/directAnswer.ts). GPT-Live phrases them, so the agent
   * skips the model step that would only reword them.
   */
  directToolAnswers?: boolean;
}): ReceptionistAgent {
  // One lookup, maybe a second, then the answer. Voice callers are waiting.
  const stopWhen: Array<StopCondition<ToolSet>> = [stepCountIs(4)];
  if (input.directToolAnswers) stopWhen.push(({ steps }) => directToolAnswer(steps.at(-1)) !== undefined);
  return new ToolLoopAgent({
    model: input.model,
    instructions: [buildAgentInstructions(input.context.snapshot, input.context), input.extraInstructions].filter(Boolean).join("\n\n"),
    tools: createReceptionistTools(input.context),
    stopWhen,
    ...(input.context.channel === "web_chat" ? { maxOutputTokens: WEB_CHAT_MAX_OUTPUT_TOKENS } : {}),
  });
}
