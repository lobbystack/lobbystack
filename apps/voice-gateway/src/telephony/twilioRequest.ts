import { createHmac, timingSafeEqual } from "node:crypto";

type TwilioSignatureInput = {
  authToken: string | undefined;
  signatureHeader: string | string[] | undefined;
  url: string;
  params?: Record<string, string>;
};

export function buildTwilioRequestUrl(baseUrl: string, requestUrl: string): string {
  return new URL(requestUrl, baseUrl).toString();
}

export function normalizeFormFields(
  payload: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!payload) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(payload)
      .filter((entry): entry is [string, string | number | boolean] => {
        const value = entry[1];
        return (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        );
      })
      .map(([key, value]) => [key, String(value)]),
  );
}

export function validateTwilioSignature(input: TwilioSignatureInput): boolean {
  if (!input.authToken) {
    return true;
  }

  const providedSignature = Array.isArray(input.signatureHeader)
    ? input.signatureHeader[0]
    : input.signatureHeader;

  if (!providedSignature) {
    return false;
  }

  const params = input.params ?? {};
  const signedPayload = `${input.url}${Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("")}`;
  const expectedSignature = createHmac("sha1", input.authToken)
    .update(signedPayload, "utf8")
    .digest("base64");

  const providedBuffer = Buffer.from(providedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}
