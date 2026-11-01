import type { Metadata } from "next";

import { readCheckInToken } from "@lobbystack/domain";

import { CheckInSurface } from "@/components/check-in-surface";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Opening a link only reads it, so a mail scanner can't answer for the owner.
export default async function CheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CheckInSurface answer={readCheckInToken(token)?.answer ?? null} token={token} />;
}
