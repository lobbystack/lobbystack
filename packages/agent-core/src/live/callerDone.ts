import { generateText, type LanguageModel } from "ai";

// GPT-Live answers a caller's "bye" after its own goodbye, but rarely hands
// the call over again, so the worker asks this instead. It runs only when the
// caller speaks after the agent ended the call, never on other turns.
const INSTRUCTIONS = [
  "A phone receptionist ended this call because the caller was done, and said goodbye. Then the caller spoke again. Judge the caller's latest words in the conversation below.",
  "Answer done when those words only close the call, such as a goodbye or thanks.",
  "Answer continue when they ask for anything, start to, or might want to keep talking, such as \"oh, one more thing\" or \"wait\".",
  "Reply with one word: done or continue.",
].join(" ");

/** Whether a caller who spoke after the agent ended the call is only saying goodbye. */
export async function callerIsDone(model: LanguageModel, conversation: string, abortSignal?: AbortSignal): Promise<boolean> {
  const { text } = await generateText({ model, system: INSTRUCTIONS, prompt: conversation, ...(abortSignal ? { abortSignal } : {}) });
  return text.trim().toLowerCase().startsWith("done");
}
