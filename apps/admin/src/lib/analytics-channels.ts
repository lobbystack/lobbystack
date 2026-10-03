/** Channel buckets returned by the analytics API, in display order. */
export const ANALYTICS_CHANNELS = ["phone_call", "web_call", "sms", "web_chat", "other"] as const;
export type AnalyticsChannel = (typeof ANALYTICS_CHANNELS)[number];
export type AnalyticsChannelCounts = Record<AnalyticsChannel, number>;

/**
 * Whole-number percentages for each channel. Rounding uses the largest
 * remainder so the shares add up to exactly 100 whenever there is activity.
 */
export function channelPercentages(counts: Partial<AnalyticsChannelCounts> | null | undefined): AnalyticsChannelCounts {
  const values = ANALYTICS_CHANNELS.map((channel) => Math.max(0, Number(counts?.[channel] ?? 0) || 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  const exact = values.map((value) => (total ? (value / total) * 100 : 0));
  const shares = exact.map(Math.floor);
  let remaining = total ? 100 - shares.reduce((sum, value) => sum + value, 0) : 0;
  const byRemainder = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    shares[index]! += 1;
    remaining -= 1;
  }
  return Object.fromEntries(ANALYTICS_CHANNELS.map((channel, index) => [channel, shares[index]!])) as AnalyticsChannelCounts;
}
