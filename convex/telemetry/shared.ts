import type { Id } from "../_generated/dataModel";

export type TelemetryScalar = string | number | boolean | null;
export type TelemetryValue =
  | TelemetryScalar
  | Array<TelemetryValue>
  | { [key: string]: TelemetryValue | undefined };
export type TelemetryProperties = Record<string, TelemetryValue | undefined>;

const EXACT_REDACTION_KEYS = new Set([
  "$ai_input",
  "$ai_output",
  "$ai_output_choices",
  "body",
  "content",
  "message",
  "messages",
  "name",
  "phone",
  "prompt",
  "prompts",
  "recordingUrl",
  "recording_url",
  "smsBody",
  "sms_body",
  "text",
  "toolArguments",
  "tool_arguments",
  "toolOutput",
  "tool_output",
  "toolResult",
  "tool_result",
  "transcript",
  "utterance",
  "utterances",
  "aiinput",
  "aioutput",
  "aioutputchoices",
  "assistantmessage",
  "assistantresponse",
  "tooloutput",
  "toolresult",
  "usermessage",
]);

const PARTIAL_REDACTION_KEYWORDS = [
  "address",
  "body",
  "caller",
  "contact",
  "customer",
  "email",
  "message",
  "name",
  "note",
  "outputchoice",
  "phone",
  "prompt",
  "recording",
  "sms",
  "text",
  "tool_output",
  "toolarg",
  "tool_input",
  "token",
  "transcript",
  "utterance",
  "assistant",
];

const SAFE_KEY_PATTERNS = [
  "cachedtokens",
  "cachedinputtokens",
  "charcount",
  "completiontokens",
  "costusd",
  "dimension",
  "embeddingtokens",
  "entrycount",
  "filename",
  "inputcharcount",
  "inputtokens",
  "exceptiontype",
  "httpstatuscode",
  "messagecount",
  "outputtokens",
  "outputcharcount",
  "prompttokens",
  "providererrorcode",
  "providererrorkind",
  "providererrorstatus",
  "reasoningtokens",
  "timetofirsttoken",
  "tokencount",
  "totaltokens",
  "ttft",
  "toolname",
  "providername",
  "modelname",
  "workflowname",
];

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function shouldRedactKey(key: string): boolean {
  const normalizedKey = normalizeKey(key);
  if (SAFE_KEY_PATTERNS.some((pattern) => normalizedKey.includes(pattern))) {
    return false;
  }
  if (EXACT_REDACTION_KEYS.has(key) || EXACT_REDACTION_KEYS.has(normalizedKey)) {
    return true;
  }
  return PARTIAL_REDACTION_KEYWORDS.some((keyword) =>
    normalizedKey.includes(keyword),
  );
}

function maskString(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `***${digits.slice(-4)}`;
  }
  return "[redacted]";
}

function redactValue(value: TelemetryValue | undefined): TelemetryValue | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => redactValue(entry))
      .filter((entry): entry is TelemetryValue => entry !== undefined);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      shouldRedactKey(key) ? "[redacted]" : redactValue(nestedValue),
    ]),
  );
}

export function redactTelemetryProperties(
  properties: TelemetryProperties,
): TelemetryProperties {
  const redacted: TelemetryProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) {
      continue;
    }
    if (shouldRedactKey(key)) {
      redacted[key] =
        typeof value === "string" && key.toLowerCase().includes("phone")
          ? maskString(value)
          : "[redacted]";
      continue;
    }
    if (typeof value === "string" && key.toLowerCase().includes("phone")) {
      redacted[key] = maskString(value);
      continue;
    }
    redacted[key] = redactValue(value);
  }
  return redacted;
}

export function getPostHogDistinctIdForBusinessSystem(
  businessId: string | Id<"businesses">,
): string {
  return `system:business:${String(businessId)}`;
}

export function getPostHogBusinessGroupKey(
  businessId: string | Id<"businesses">,
): string {
  return `business:${String(businessId)}`;
}

export function isTelemetryExportEnabledInConvex(): boolean {
  return (process.env.DEPLOYMENT_MODE ?? "development") === "cloud";
}
