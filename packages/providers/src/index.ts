import type { BusinessContextSnapshot } from "@lobbystack/shared";

export type OutboundSmsMessage = {
  to: string;
  from: string;
  body: string;
  businessId: string;
  statusCallbackUrl?: string;
};

export type InboundSmsWebhook = {
  from: string;
  to: string;
  body: string;
  providerMessageId?: string;
  optOutType?: string;
};

export type SmsProviderMessage = {
  providerMessageId: string;
  providerStatus: string;
  providerPrice?: number;
  providerPriceUnit?: string;
  providerNumSegments?: number;
  providerUpdatedAt?: string;
};

export interface TelephonyProvider {
  validateVoiceWebhook(signature: string | null, url: string, body: string): boolean;
  createMediaStreamResponse(input: {
    streamUrl: string;
    callSid: string;
    businessId: string;
  }): string;
  transferCall(input: { callSid: string; destination: string }): Promise<void>;
}

export interface SmsProvider {
  validateWebhook(signature: string | null, url: string, body: string): Promise<boolean>;
  sendMessage(input: OutboundSmsMessage): Promise<{ providerMessageId: string; providerStatus: string }>;
  normalizeInboundWebhook(body: Record<string, string>): InboundSmsWebhook;
  fetchMessage(providerMessageId: string): Promise<SmsProviderMessage>;
}

export interface RealtimeVoiceProvider {
  createSession(input: {
    snapshot: BusinessContextSnapshot;
    tools: Array<{ name: string; description: string }>;
  }): Promise<{ sessionId: string }>;
  closeSession(sessionId: string): Promise<void>;
}

export interface TextAiProvider {
  generateReply(input: {
    instructions: string;
    prompt: string;
    context?: string;
  }): Promise<{ text: string }>;
  summarize(input: { instructions: string; transcript: string }): Promise<{ text: string }>;
}

export interface CalendarProvider {
  getBusyBlocks(input: {
    connectionId: string;
    startsAt: string;
    endsAt: string;
  }): Promise<Array<{ startsAt: string; endsAt: string }>>;
  upsertEvent(input: {
    connectionId: string;
    externalEventId?: string;
    title: string;
    startsAt: string;
    endsAt: string;
    description?: string;
  }): Promise<{ externalEventId: string }>;
}

export interface EmailProvider {
  sendTemplate(input: {
    template: "verify_email" | "password_reset" | "operator_alert";
    to: string;
    subject: string;
    variables: Record<string, string>;
  }): Promise<{ messageId: string }>;
}

export interface BusinessContextRuntime {
  getSnapshot(input: { businessId: string }): Promise<BusinessContextSnapshot>;
}

export interface ConversationAgentRuntime {
  ensureThread(input: {
    businessId: string;
    conversationId: string;
    userId?: string;
  }): Promise<{ threadId: string }>;
  generateReply(input: {
    threadId: string;
    instructions: string;
    prompt: string;
  }): Promise<{ text: string }>;
}

export interface KnowledgeIndexRuntime {
  indexDocument(input: {
    businessId: string;
    documentId: string;
    title: string;
    text: string;
  }): Promise<void>;
  search(input: {
    businessId: string;
    query: string;
    limit?: number;
  }): Promise<Array<{ title?: string; text: string }>>;
}

export interface DurableExecutionRuntime {
  enqueueHighPriorityAction<TArgs extends Record<string, unknown>>(
    functionReference: string,
    args: TArgs,
  ): Promise<void>;
  enqueueBulkAction<TArgs extends Record<string, unknown>>(
    functionReference: string,
    args: TArgs,
  ): Promise<void>;
}

export * from "./email/smtp";
export * from "./storage/s3";
export * from "./twilio/twilioSmsProvider";
export * from "./twilio/twilioVoiceProvider";
export * from "./twilio/twilioVerifyProvider";
export * from "./polar/polarBillingProvider";
export * from "./google/googleCalendarProvider";
export * from "./google/geminiEmbeddingProvider";
export * from "./crypto/secretBox";
