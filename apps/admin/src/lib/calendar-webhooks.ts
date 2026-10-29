import { getCalendarWebhook, resolveCalendarAccessToken } from "@lobbystack/domain";
import { SecretBox } from "@lobbystack/providers";

import { calcomCalendarProvider, calendarProviderConfigured } from "./calendar-providers";
import { createWorkerDomainContext } from "./domain-context";

/**
 * Removes a Cal.com connection's webhook from Cal.com while its token still
 * works, so call it after the caller's access is checked and before the
 * disconnect forgets the token. It never blocks the disconnect: the webhook
 * route acknowledges and ignores deliveries for a disconnected connection.
 */
export async function retireCalendarWebhook(input: { businessId: string; connectionId: string }): Promise<void> {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey || !calendarProviderConfigured("calcom")) return;
  try {
    const context = createWorkerDomainContext();
    const webhook = await getCalendarWebhook(context, input);
    if (webhook?.provider !== "calcom" || !webhook.externalWebhookId) return;
    const provider = calcomCalendarProvider();
    const box = new SecretBox(encryptionKey);
    const accessToken = await resolveCalendarAccessToken(context, { ...input, decryptToken: (value) => box.decrypt(value), encryptToken: (value) => box.encrypt(value), refreshAccessToken: (refresh) => provider.refreshAccessToken(refresh) });
    await provider.deleteWebhook({ accessToken, webhookId: webhook.externalWebhookId });
  } catch {
    // Best effort, as the doc comment says.
  }
}
