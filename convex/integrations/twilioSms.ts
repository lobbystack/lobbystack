"use node";

import { v } from "convex/values";
import twilio from "twilio";

import { internalAction } from "../_generated/server";

function requireTwilioCredentials(): { accountSid: string; authToken: string } {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are required for SMS delivery.");
  }

  return { accountSid, authToken };
}

function getTwilioClient() {
  const { accountSid, authToken } = requireTwilioCredentials();
  return twilio(accountSid, authToken);
}

export const validateWebhookSignature = internalAction({
  args: {
    signatureHeader: v.optional(v.string()),
    url: v.string(),
    params: v.record(v.string(), v.string()),
  },
  handler: async (_ctx, args): Promise<boolean> => {
    const { authToken } = requireTwilioCredentials();
    if (!args.signatureHeader) {
      return false;
    }

    return twilio.validateRequest(authToken, args.signatureHeader, args.url, args.params);
  },
});

export const sendMessage = internalAction({
  args: {
    to: v.string(),
    from: v.string(),
    body: v.string(),
    statusCallbackUrl: v.string(),
    mediaUrls: v.optional(v.array(v.string())),
  },
  handler: async (_ctx, args) => {
    const client = getTwilioClient();
    const message = await client.messages.create({
      to: args.to,
      from: args.from,
      body: args.body,
      statusCallback: args.statusCallbackUrl,
      ...(args.mediaUrls && args.mediaUrls.length > 0
        ? { mediaUrl: args.mediaUrls }
        : {}),
    });

    return {
      providerMessageSid: message.sid,
      providerStatus: message.status ?? "queued",
    };
  },
});
