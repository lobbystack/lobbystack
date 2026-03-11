import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export const NON_REALTIME_TEXT_PROVIDER = "google";
export const DEFAULT_NON_REALTIME_TEXT_MODEL_ID =
  "gemini-3.1-flash-lite-preview";

export function getNonRealtimeTextModelId(): string {
  return process.env.GEMINI_TEXT_MODEL ?? DEFAULT_NON_REALTIME_TEXT_MODEL_ID;
}

export function createNonRealtimeTextModel(): LanguageModel {
  return google(getNonRealtimeTextModelId());
}
