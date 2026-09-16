export function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
}

export type Sample = { durationMs: number; ok: boolean; bytes: number; status: number | null };

export function summarize(samples: Sample[], elapsedMs: number) {
  const successful = samples.filter(sample => sample.ok).map(sample => sample.durationMs);
  return {
    sampleCount: samples.length,
    errors: samples.filter(sample => !sample.ok).length,
    throughputPerSecond: samples.length / Math.max(elapsedMs / 1000, 0.001),
    bytes: samples.reduce((sum, sample) => sum + sample.bytes, 0),
    // Failed/time-out requests remain visible, rather than disappearing from latency.
    all: { p50: percentile(samples.map(s => s.durationMs), .5), p95: percentile(samples.map(s => s.durationMs), .95), p99: percentile(samples.map(s => s.durationMs), .99) },
    successful: { p50: percentile(successful, .5), p95: percentile(successful, .95), p99: percentile(successful, .99) },
    statuses: Object.fromEntries([...new Set(samples.map(s => String(s.status ?? "network-error")))].map(status => [status, samples.filter(s => String(s.status ?? "network-error") === status).length])),
  };
}
