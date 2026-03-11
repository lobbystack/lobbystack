export type TwilioSignatureInput = {
  authToken: string | null | undefined;
  signatureHeader: string | string[] | null | undefined;
  url: string;
  params?: Record<string, string>;
};

const textEncoder = new TextEncoder();

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export function buildTwilioSignaturePayload(
  url: string,
  params: Record<string, string> = {},
): string {
  return `${url}${Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("")}`;
}

export async function computeTwilioSignature(input: {
  authToken: string;
  url: string;
  params?: Record<string, string>;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(input.authToken),
    {
      name: "HMAC",
      hash: "SHA-1",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(buildTwilioSignaturePayload(input.url, input.params)),
  );

  return base64Encode(new Uint8Array(signature));
}

export async function validateTwilioSignature(
  input: TwilioSignatureInput,
): Promise<boolean> {
  if (!input.authToken) {
    return false;
  }

  const providedSignature = Array.isArray(input.signatureHeader)
    ? input.signatureHeader[0]
    : input.signatureHeader;

  if (!providedSignature) {
    return false;
  }

  const expectedSignature = await computeTwilioSignature(
    input.params === undefined
      ? {
          authToken: input.authToken,
          url: input.url,
        }
      : {
          authToken: input.authToken,
          url: input.url,
          params: input.params,
        },
  );

  return constantTimeEqual(providedSignature, expectedSignature);
}

export function normalizeTwilioFormFields(
  entries:
    | Iterable<[string, FormDataEntryValue]>
    | Record<string, string | number | boolean | undefined | null>,
): Record<string, string> {
  if (Symbol.iterator in Object(entries)) {
    return Object.fromEntries(
      Array.from(entries as Iterable<[string, FormDataEntryValue]>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([key, value]) => [key, value]),
    );
  }

  return Object.fromEntries(
    Object.entries(entries)
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

export function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}
