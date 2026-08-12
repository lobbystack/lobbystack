const exactRedactionKeys = new Set([
  "$ai_input", "$ai_output", "$ai_output_choices", "body", "content", "fileName", "filename", "message", "messages", "name", "objectKey", "object_key", "phone", "prompt", "prompts", "recordingUrl", "recording_url", "smsBody", "sms_body", "storageKey", "storage_key", "text", "toolArguments", "tool_arguments", "toolOutput", "tool_output", "toolResult", "tool_result", "transcript", "utterance", "utterances", "aiinput", "aioutput", "aioutputchoices", "assistantmessage", "assistantresponse", "tooloutput", "toolresult", "usermessage",
]);

const partialRedactionKeywords = [
  "address", "body", "caller", "contact", "customer", "email", "filename", "message", "name", "note", "objectkey", "outputchoice", "phone", "prompt", "recording", "sms", "storagekey", "text", "tool_output", "token", "toolarg", "tool_input", "transcript", "utterance", "assistant",
];

const safeKeyPatterns = [
  "cachedtokens", "cachedinputtokens", "charcount", "completiontokens", "costusd", "dimension", "embeddingtokens", "entrycount", "inputcharcount", "inputtokens", "messagelinkkey", "messagecount", "outputtokens", "outputcharcount", "prompttokens", "reasoningtokens", "spanname", "timetofirsttoken", "tokencount", "totaltokens", "traceid", "ttft", "toolname", "providername", "modelname", "exceptiontype", "httpstatuscode", "providererrorcode", "providererrorkind", "providererrorstatus", "sessionid", "workflowname",
];

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function shouldRedactKey(key: string): boolean {
  const normalizedKey = normalizeKey(key);
  if (safeKeyPatterns.some((pattern) => normalizedKey.includes(pattern))) return false;
  if (exactRedactionKeys.has(key) || exactRedactionKeys.has(normalizedKey)) return true;
  return partialRedactionKeywords.some((keyword) => normalizedKey.includes(keyword));
}

export function maskString(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4) return `***${digits.slice(-4)}`;
  if (value.length > 8) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return "[redacted]";
}

export function redactSignedStorageUrls(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+(?:\?|&)X-Amz-[^\s"'<>]*/gi, "[redacted-signed-url]");
}

export function redactOtelAttributes(
  attributes: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean | undefined> {
  const sanitized: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    if (shouldRedactKey(key)) {
      sanitized[key] = typeof value === "string" && key.toLowerCase().includes("phone") ? maskString(value) : "[redacted]";
      continue;
    }
    sanitized[key] = typeof value === "string" && key.toLowerCase().includes("phone") ? maskString(value) : typeof value === "string" ? redactSignedStorageUrls(value) : value;
  }
  return sanitized;
}
