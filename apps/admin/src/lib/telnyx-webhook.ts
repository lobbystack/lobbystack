import "server-only";

import { validateTelnyxSignature } from "@lobbystack/providers/telnyx/webhookSecurity";

/** Reads a Telnyx webhook's raw body and whether its Ed25519 signature matches TELNYX_PUBLIC_KEY. */
export async function readSignedTelnyxWebhook(request: Request): Promise<{ rawBody: string; signed: boolean }> {
  const rawBody = await request.text();
  const signed = validateTelnyxSignature({ publicKey: process.env.TELNYX_PUBLIC_KEY, signatureHeader: request.headers.get("telnyx-signature-ed25519"), timestampHeader: request.headers.get("telnyx-timestamp"), rawBody });
  return { rawBody, signed };
}
