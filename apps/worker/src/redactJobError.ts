import { redactOtelExceptionText } from "@lobbystack/telemetry/node";

// BullMQ persists a failed job's message and stack in Redis. Redact in place so
// the error keeps its class and name, which BullMQ uses to recognize
// UnrecoverableError, DelayedError, and similar control-flow errors.
export function redactJobError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  // V8 copies the message (Drizzle params, possibly multi-line customer text)
  // into the stack header, so keep only the frames below it. Read the stack
  // first: V8 formats it lazily, from the message current at first access.
  const stack = error.stack;
  const headerLines = error.message.split("\n").length;
  // Define own properties: DOMException (e.g. AbortSignal.timeout) exposes
  // `message` as a getter-only accessor, so plain assignment throws.
  Object.defineProperty(error, "message", { value: redactOtelExceptionText(error.message), writable: true, configurable: true });
  if (stack) Object.defineProperty(error, "stack", { value: [`${error.name}: ${error.message}`, ...stack.split("\n").slice(headerLines).filter((line) => /^\s+at /.test(line)).slice(0, 29).map(redactOtelExceptionText)].join("\n"), writable: true, configurable: true });
  return error;
}
