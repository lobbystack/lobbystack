import type { Metadata } from "next";

import { marketingEmailsSubscribed, readMarketingUnsubscribeToken } from "@lobbystack/domain";

import { UnsubscribeSurface } from "@/components/unsubscribe-surface";
import { getAuthDatabase } from "@/lib/auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Opening the link only reads it, so a mail scanner that opens it can't unsubscribe anyone.
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = readMarketingUnsubscribeToken(token);
  const subscribed = link ? await marketingEmailsSubscribed(getAuthDatabase().db, link.userId) : null;
  return <UnsubscribeSurface initial={subscribed === null ? "invalid" : subscribed ? "subscribed" : "unsubscribed"} token={token} />;
}
