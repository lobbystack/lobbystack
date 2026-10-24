/** Conversation channels the receptionist answers in writing, where the team can take a chat over. */
export const TEXT_CHAT_CHANNELS = ["web_chat", "instagram"] as const;
export type TextChatChannel = (typeof TEXT_CHAT_CHANNELS)[number];

/** Whether a conversation is a website or Instagram chat rather than a call or a text message. */
export function isTextChatChannel(channel: string | null | undefined): channel is TextChatChannel {
  return (TEXT_CHAT_CHANNELS as readonly (string | null | undefined)[]).includes(channel);
}
