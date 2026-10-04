import twilio from "twilio";

/** Restore the configured public endpoint while retaining the exact signed query. */
export function resolveTwilioWebhookUrl(requestUrl: string, publicEndpoint?: string): string {
  if (!publicEndpoint) return requestUrl;
  const endpoint = new URL(publicEndpoint);
  endpoint.search = new URL(requestUrl).search;
  endpoint.hash = "";
  return endpoint.toString();
}

export function validateTwilioSignature(input: {
  authToken: string | null | undefined;
  signatureHeader: string | null | undefined;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (!input.authToken || !input.signatureHeader) return false;
  return twilio.validateRequest(input.authToken, input.signatureHeader, input.url, input.params);
}
