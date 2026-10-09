import { stepCountIs, ToolLoopAgent, type LanguageModel, type StopCondition, type ToolExecutionOptions, type ToolSet } from "ai";

import { reportError, withOpenSpan } from "@lobbystack/telemetry/node";

import { buildAgentInstructions } from "./instructions";
import { directToolAnswer } from "./live/directAnswer";
import { createReceptionistTools, type AgentToolContext } from "./tools";

export type ReceptionistAgent = ToolLoopAgent<never, ToolSet>;

/**
 * Runs each tool call in its own span, so the database work and provider
 * requests it makes nest under it, inside the call or chat request that asked
 * for it. A tool that throws is reported: the model only sees the failure.
 */
export function withToolSpans(tools: ToolSet): ToolSet {
  return Object.fromEntries(Object.entries(tools).map(([name, definition]) => {
    const execute = definition.execute as ((input: unknown, options: ToolExecutionOptions<unknown>) => unknown) | undefined;
    if (!execute) return [name, definition];
    const traced = async (input: unknown, options: ToolExecutionOptions<unknown>) => await withOpenSpan(`tool.${name}`, { attributes: { "gen_ai.tool.name": name } }, async (span) => {
      try {
        const output = await execute(input, options);
        const ok = (output as { ok?: unknown } | null | undefined)?.ok;
        if (typeof ok === "boolean") span.setAttribute("lobbystack.tool.ok", ok);
        return output;
      } catch (error) {
        // A call that ended aborts its tools, which is no failure.
        if (!options.abortSignal?.aborted) void reportError(error, { operation: `tool.${name}` });
        throw error;
      } finally {
        span.end();
      }
    });
    return [name, { ...definition, execute: traced }];
  })) as ToolSet;
}

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
    tools: withToolSpans(createReceptionistTools(input.context)),
    stopWhen,
  });
}
