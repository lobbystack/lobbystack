import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.4-mini";

type AgentModelEnvironment = Record<string, string | undefined>;

// Reads the same AI_CHAT_* variables as website chat, so self-hosters configure one
// text provider. AGENT_CORE_MODEL lets the agent use a faster model than chat.
export function createAgentModel(environment: AgentModelEnvironment = process.env): LanguageModel | undefined {
  const baseURL = environment.AI_CHAT_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const apiKey = environment.AI_CHAT_API_KEY?.trim() || environment.OPENAI_API_KEY?.trim();
  if (!apiKey && baseURL === DEFAULT_BASE_URL) return undefined;
  const provider = createOpenAICompatible({
    name: environment.AI_CHAT_PROVIDER_NAME?.trim() || "openai",
    baseURL,
    ...(apiKey ? { apiKey } : {}),
  });
  return provider.chatModel(environment.AGENT_CORE_MODEL?.trim() || environment.AI_CHAT_MODEL?.trim() || DEFAULT_MODEL);
}
