import { stepCountIs, ToolLoopAgent, type LanguageModel, type StopCondition, type ToolSet } from "ai";

import { isWrittenChannel } from "@lobbystack/shared";

import { toolUse } from "./capabilities";
import { buildAgentInstructions } from "./instructions";
import { directToolAnswer } from "./live/directAnswer";
import { createAgentTools, type AgentToolContext } from "./tools";

export type ConversationAgent = ToolLoopAgent<never, ToolSet>;

/**
 * A text chat's cap on each model step's output, so no reply runs long even
 * when a visitor talks the model past its instructions. OpenAI counts
 * reasoning tokens toward it, so it leaves room for high reasoning; the
 * instructions keep the visible reply to about 100 words.
 */
export const WEB_CHAT_MAX_OUTPUT_TOKENS = 4_000;

export function createConversationAgent(input: {
  model: LanguageModel;
  context: AgentToolContext;
  extraInstructions?: string;
  /**
   * Live calls only: stop as soon as a step's tool results can be spoken as
   * they are (see live/directAnswer.ts). GPT-Live phrases them, so the agent
   * skips the model step that would only reword them.
   */
  directToolAnswers?: boolean;
  /**
   * Called after a step where a tool changed something, such as saving a
   * message or booking. It fires before any later failure, so a job can tell
   * that running the agent again would do the change twice.
   */
  onAction?: () => void;
}): ConversationAgent {
  // One lookup, maybe a second, then the answer. Voice callers are waiting.
  const stopWhen: Array<StopCondition<ToolSet>> = [stepCountIs(4)];
  if (input.directToolAnswers) stopWhen.push(({ steps }) => directToolAnswer(steps.at(-1)) !== undefined);
  return new ToolLoopAgent({
    model: input.model,
    instructions: [buildAgentInstructions(input.context.snapshot, input.context), input.extraInstructions].filter(Boolean).join("\n\n"),
    tools: createAgentTools(input.context),
    stopWhen,
    ...(isWrittenChannel(input.context.channel) ? { maxOutputTokens: WEB_CHAT_MAX_OUTPUT_TOKENS } : {}),
    ...(input.onAction ? { onStepEnd: ({ toolResults }: { toolResults: ReadonlyArray<{ toolName: string; output: unknown }> }) => { if (toolResults.some(changedSomething)) input.onAction?.(); } } : {}),
  });
}

// A tool that answers { ok: false } refused before it changed anything.
function changedSomething(result: { toolName: string; output: unknown }): boolean {
  return toolUse(result.toolName).kind === "action" && (result.output as { ok?: unknown } | null)?.ok !== false;
}
