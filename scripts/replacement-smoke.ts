import { pathToFileURL } from "node:url";

type SmokeTarget = { name: string; baseUrl: string; path: string };

export function smokeTargets(source: NodeJS.ProcessEnv = process.env): SmokeTarget[] {
  return [
    { name: "admin", baseUrl: source.ADMIN_BASE_URL ?? "http://127.0.0.1:13000", path: "/api/health/live" },
    { name: "admin-ready", baseUrl: source.ADMIN_BASE_URL ?? "http://127.0.0.1:13000", path: "/api/health/ready" },
    { name: "worker", baseUrl: source.WORKER_BASE_URL ?? "http://127.0.0.1:13002", path: "/health/live" },
    { name: "worker-ready", baseUrl: source.WORKER_BASE_URL ?? "http://127.0.0.1:13002", path: "/health/ready" },
    { name: "voice", baseUrl: source.VOICE_BASE_URL ?? "http://127.0.0.1:13001", path: "/health/live" },
  ];
}

async function main(): Promise<void> {
  for (const target of smokeTargets()) {
    const response = await fetch(new URL(target.path, target.baseUrl));
    if (!response.ok) {
      throw new Error(`${target.name} health check failed with status ${response.status}.`);
    }
    const body = await response.json() as { ok?: boolean; status?: string };
    if (body.ok !== true) {
      throw new Error(`${target.name} health check returned an invalid response.`);
    }
    console.log(`${target.name}: ok`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
