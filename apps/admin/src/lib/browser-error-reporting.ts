import posthog from "posthog-js";

export function captureBrowserError(error: unknown): void {
  if (!posthog.__loaded || posthog.has_opted_out_capturing()) return;
  const original = error instanceof Error ? error : new Error("Unhandled browser rejection");
  const redact = (text: string) => text
    .replace(/https?:\/\/[^\s)]+/g, value => { try { const url = new URL(value); url.search = ""; url.hash = ""; return url.toString(); } catch { return "[url]"; } })
    .replace(/Bearer\s+\S+|\b(?:sk|rk|phx)_[A-Za-z0-9_-]+/gi, "[redacted]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]+/gi, "[email]");
  const safe = new Error(redact(original.message).slice(0, 500));
  safe.name = original.name;
  if (original.stack) safe.stack = original.stack.split("\n").slice(0, 25).map(redact).join("\n");
  posthog.captureException(safe, { service: "lobbystack-admin-browser", release: process.env.NEXT_PUBLIC_SERVICE_VERSION, environment: process.env.NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT, ...( "digest" in original ? { digest: String(original.digest) } : {}) });
}
