type SmokeTarget = { name: string; baseUrl: string; path: string };

const targets: SmokeTarget[] = [
  { name: "admin", baseUrl: process.env.ADMIN_BASE_URL ?? "http://127.0.0.1:13000", path: "/api/health/live" },
  { name: "admin-ready", baseUrl: process.env.ADMIN_BASE_URL ?? "http://127.0.0.1:13000", path: "/api/health/ready" },
  { name: "worker", baseUrl: process.env.WORKER_BASE_URL ?? "http://127.0.0.1:13002", path: "/health/live" },
  { name: "worker-ready", baseUrl: process.env.WORKER_BASE_URL ?? "http://127.0.0.1:13002", path: "/health/ready" },
  { name: "voice", baseUrl: process.env.VOICE_BASE_URL ?? "http://127.0.0.1:13001", path: "/health/live" },
  { name: "otel-collector", baseUrl: process.env.OTEL_BASE_URL ?? "http://127.0.0.1:13133", path: "/health" },
];

async function main(): Promise<void> {
  for (const target of targets) {
    const response = await fetch(new URL(target.path, target.baseUrl));
    if (!response.ok) {
      throw new Error(`${target.name} health check failed with status ${response.status}.`);
    }
    const body = await response.json() as { ok?: boolean; status?: string };
    const healthy = target.name === "otel-collector"
      ? body.status === "Server available"
      : body.ok === true;
    if (!healthy) {
      throw new Error(`${target.name} health check returned an invalid response.`);
    }
    console.log(`${target.name}: ok`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
