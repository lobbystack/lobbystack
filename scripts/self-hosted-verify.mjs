import {
  isPlaceholderValue,
  parseArgs,
  readEnvFile,
  resolveEnvFile,
} from "./lib/self-hosted-env.mjs";

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function urlJoin(base, path) {
  return `${trimTrailingSlash(base)}${path}`;
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? 5_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function check(name, run) {
  try {
    const result = await run();
    if (result.skip) {
      console.log(`SKIP ${name}: ${result.message}`);
      return true;
    }
    if (result.ok) {
      console.log(`PASS ${name}: ${result.message}`);
      return true;
    }
    console.error(`FAIL ${name}: ${result.message}`);
    return false;
  } catch (error) {
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function expectStatus(name, url, expected) {
  return await check(name, async () => {
    const response = await fetchWithTimeout(url);
    const ok = expected(response);
    return {
      ok,
      message: `${response.status} ${response.statusText} from ${url}`,
    };
  });
}

const PLACEHOLDER_SECRET_KEYS = ["INSTANCE_SECRET", "INTERNAL_SERVICE_TOKEN"];

const args = parseArgs(process.argv.slice(2));
const envFile = resolveEnvFile(args.envFile);
const env = readEnvFile(envFile);

const placeholderSecrets = PLACEHOLDER_SECRET_KEYS.filter(
  (key) => !env[key] || isPlaceholderValue(env[key]),
);
if (placeholderSecrets.length > 0) {
  console.error(
    `FAIL secrets: Replace placeholder values for ${placeholderSecrets.join(", ")}. Run: pnpm self-hosted:secrets -- --write ${envFile}`,
  );
  process.exit(1);
}

const webBaseUrl =
  env.SELF_HOSTED_WEB_VERIFY_URL ?? `http://127.0.0.1:${env.WEB_PORT || "8080"}`;
const voiceBaseUrl =
  env.SELF_HOSTED_VOICE_VERIFY_URL ??
  `http://127.0.0.1:${env.VOICE_GATEWAY_PORT || "3001"}`;
const convexBaseUrl =
  env.SELF_HOSTED_CONVEX_VERIFY_URL ??
  env.CONVEX_SELF_HOSTED_URL ??
  `http://127.0.0.1:${env.CONVEX_PORT || "3210"}`;
const convexSiteBaseUrl =
  env.SELF_HOSTED_CONVEX_SITE_VERIFY_URL ??
  `http://127.0.0.1:${env.CONVEX_SITE_PROXY_PORT || "3211"}`;
const dashboardBaseUrl =
  env.SELF_HOSTED_DASHBOARD_VERIFY_URL ??
  `http://127.0.0.1:${env.CONVEX_DASHBOARD_PORT || "6791"}`;

const checks = [
  expectStatus("web health", urlJoin(webBaseUrl, "/healthz"), (response) => response.ok),
  expectStatus("web SPA fallback", urlJoin(webBaseUrl, "/settings"), (response) => {
    const contentType = response.headers.get("content-type") ?? "";
    return response.ok && contentType.includes("text/html");
  }),
  expectStatus("voice health", urlJoin(voiceBaseUrl, "/health"), (response) => response.ok),
  expectStatus("convex backend version", urlJoin(convexBaseUrl, "/version"), (response) => response.ok),
  expectStatus("convex dashboard", dashboardBaseUrl, (response) => response.ok),
  check("convex voice context HTTP action", async () => {
    if (!env.INTERNAL_SERVICE_TOKEN || isPlaceholderValue(env.INTERNAL_SERVICE_TOKEN)) {
      return {
        skip: true,
        message: "INTERNAL_SERVICE_TOKEN is not configured.",
      };
    }

    const response = await fetchWithTimeout(urlJoin(convexSiteBaseUrl, "/voice/context"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": env.INTERNAL_SERVICE_TOKEN,
      },
      body: JSON.stringify({
        phoneNumber: "+15555550100",
        channel: "voice",
      }),
    });

    return {
      ok: response.ok || response.status === 404,
      message: `${response.status} ${response.statusText}; 404 is acceptable before tenant data exists`,
    };
  }),
];

const results = await Promise.all(checks);
const failed = results.filter((ok) => !ok).length;

if (failed > 0) {
  console.error(`${failed} self-hosted verification check${failed === 1 ? "" : "s"} failed.`);
  process.exit(1);
}

console.log(`All self-hosted verification checks passed using ${envFile}.`);
