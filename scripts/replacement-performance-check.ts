type Target = { name: string; url: string; expectedStatus?: number; targetMs: number };

const concurrency = Math.max(5, Math.min(100, Number(process.env.PERFORMANCE_CONCURRENCY ?? 30)));
const adminBaseUrl = process.env.ADMIN_BASE_URL ?? "http://127.0.0.1:13000";
const workerBaseUrl = process.env.WORKER_BASE_URL ?? "http://127.0.0.1:13002";
const voiceBaseUrl = process.env.VOICE_BASE_URL ?? "http://127.0.0.1:13001";

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1))] ?? Number.POSITIVE_INFINITY;
}

async function measure(target: Target): Promise<{ p50: number; p95: number; statuses: number[] }> {
  const samples = await Promise.all(Array.from({ length: concurrency }, async () => {
    const startedAt = performance.now();
    const response = await fetch(target.url, { cache: "no-store" });
    return { duration: performance.now() - startedAt, status: response.status };
  }));
  const statuses = [...new Set(samples.map((sample) => sample.status))];
  if (target.expectedStatus !== undefined && statuses.some((status) => status !== target.expectedStatus)) throw new Error(`${target.name} returned unexpected statuses: ${statuses.join(",")}.`);
  return { p50: percentile(samples.map((sample) => sample.duration), 0.5), p95: percentile(samples.map((sample) => sample.duration), 0.95), statuses };
}

async function main(): Promise<void> {
  const targets: Target[] = [
    { name: "admin-live", url: `${adminBaseUrl}/api/health/live`, expectedStatus: 200, targetMs: 500 },
    { name: "admin-ready", url: `${adminBaseUrl}/api/health/ready`, expectedStatus: 200, targetMs: 500 },
    { name: "worker-live", url: `${workerBaseUrl}/health/live`, expectedStatus: 200, targetMs: 500 },
    { name: "worker-ready", url: `${workerBaseUrl}/health/ready`, expectedStatus: 200, targetMs: 500 },
    { name: "voice-live", url: `${voiceBaseUrl}/health/live`, expectedStatus: 200, targetMs: 300 },
    { name: "voice-ready", url: `${voiceBaseUrl}/health/ready`, expectedStatus: 200, targetMs: 300 },
  ];
  const results: Record<string, { p50: number; p95: number; statuses: number[] }> = {};
  for (const target of targets) {
    const result = await measure(target);
    results[target.name] = result;
    if (result.p95 >= target.targetMs) throw new Error(`${target.name} p95 ${result.p95.toFixed(1)} ms exceeded ${target.targetMs} ms.`);
  }
  console.log(JSON.stringify({ concurrency, targets: results }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
