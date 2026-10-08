import { stepCountIs, ToolLoopAgent, type LanguageModel, type StopCondition, type ToolSet } from "ai";

import { buildAgentInstructions } from "./instructions";
import { directToolAnswer } from "./live/directAnswer";
import { createReceptionistTools, type AgentToolContext } from "./tools";

export type ReceptionistAgent = ToolLoopAgent<never, ToolSet>;

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
    instructions: [buildAgentInstructions(input.context.snapshot, input.context.channel, { intakeOnly: input.context.intakeOnly ?? false, endsCalls: input.context.callControl !== undefined, ...(input.context.callerPhone ? { callerPhone: input.context.callerPhone } : {}) }), input.extraInstructions].filter(Boolean).join("\n\n"),
    tools: createReceptionistTools(input.context),
    stopWhen,
  });
}
