import { generateText, type LanguageModel } from "ai";

// GPT-Live answers a caller's "bye" after its own goodbye, but rarely hands
// the call over again, so the worker asks this instead. It runs when the
// caller speaks after the agent ended the call.
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

// GPT-Live also answers some goodbyes itself without ever handing the call
// over, on 11 of 66 eval runs on 2026-10-30. Only the backend can hang up, so
// the worker asks this after a short reply to a turn GPT-Live didn't hand over.
const LEAVING_INSTRUCTIONS = [
  "This is a phone call with a receptionist. Judge the caller's latest words in the conversation below.",
  "Answer done only when those words clearly end the call: the caller says goodbye, says they have to go, or says they need nothing else, such as \"bye\", \"I have to go\" or \"no, that's it, thanks\".",
  "Answer continue when they ask for anything, answer a question, only say thanks or okay, or might want to keep talking.",
  "Reply with one word: done or continue.",
].join(" ");

/** Whether a caller GPT-Live answered without handing the call over is leaving. */
export async function callerIsLeaving(model: LanguageModel, conversation: string, abortSignal?: AbortSignal): Promise<boolean> {
  const { text } = await generateText({ model, system: LEAVING_INSTRUCTIONS, prompt: conversation, ...(abortSignal ? { abortSignal } : {}) });
  return text.trim().toLowerCase().startsWith("done");
}
