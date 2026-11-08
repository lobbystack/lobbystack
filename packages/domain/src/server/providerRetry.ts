/**
 * How long a provider call keeps retrying before it fails, from the first
 * transient failure. Polar has short outages several times a month, and
 * maintenance can last 15 minutes.
 */
export const PROVIDER_RETRY_WINDOW_MS = 20 * 60_000;

/**
 * How long to wait before the next try, growing with the time already spent
 * on the outage: quick while it may be a blip, then up to two minutes apart so
 * a long outage costs few calls.
 */
export function providerRetryDelayMs(elapsedMs: number): number {
  if (elapsedMs < 30_000) return 5_000;
  if (elapsedMs < 2 * 60_000) return 15_000;
  if (elapsedMs < 5 * 60_000) return 30_000;
  if (elapsedMs < 10 * 60_000) return 60_000;
  return 2 * 60_000;
}
