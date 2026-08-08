#!/usr/bin/env tsx
/**
 * End-to-end certification smoke tests for the replacement platform.
 * Run with infrastructure up and admin + worker started.
 */
import { randomUUID } from "node:crypto";

const ADMIN_URL = process.env.ADMIN_URL ?? "http://localhost:3000";
const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:8081";
const ADMIN_ORIGIN = new URL(ADMIN_URL).origin;

function apiHeaders(cookie = ""): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: ADMIN_ORIGIN,
  };
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function extractSessionCookie(response: Response): string {
  const setCookie = response.headers.getSetCookie?.() ?? [];
  const fromArray = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (fromArray) return fromArray;

  const raw = response.headers.get("set-cookie");
  if (raw) return raw.split(",")[0]?.split(";")[0] ?? "";

  return "";
}

type Check = {
  name: string;
  run: () => Promise<void>;
};

const results: Array<{ name: string; ok: boolean; error?: string }> = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, error: message });
    console.error(`✗ ${name}: ${message}`);
  }
}

async function main() {
  console.log(`Certification against ${ADMIN_URL}\n`);

  await check("admin health live", async () => {
    const res = await fetch(`${ADMIN_URL}/api/health/live`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = (await res.json()) as { status: string };
    if (body.status !== "ok") throw new Error(JSON.stringify(body));
  });

  await check("admin health ready", async () => {
    const res = await fetch(`${ADMIN_URL}/api/health/ready`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = (await res.json()) as { status: string };
    if (body.status !== "ok" && body.status !== "degraded") {
      throw new Error(JSON.stringify(body));
    }
  });

  await check("worker health live", async () => {
    const res = await fetch(`${WORKER_URL}/health/live`);
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  await check("login page renders", async () => {
    const res = await fetch(`${ADMIN_URL}/login`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const html = await res.text();
    if (!html.includes("login") && !html.includes("Login") && !html.includes("Sign")) {
      throw new Error("login page missing expected content");
    }
  });

  const testEmail = `cert-${randomUUID().slice(0, 8)}@example.com`;
  const testPassword = "CertTestPassword123!";
  let sessionCookie = "";

  await check("signup creates account", async () => {
    const res = await fetch(`${ADMIN_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: "Certification User",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`status ${res.status}: ${text}`);
    }
    sessionCookie = extractSessionCookie(res);
  });

  await check("signin returns session", async () => {
    const res = await fetch(`${ADMIN_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`status ${res.status}: ${text}`);
    }
    const cookie = extractSessionCookie(res);
    if (cookie) sessionCookie = cookie;
    if (!sessionCookie) throw new Error("no session cookie");
  });

  await check("session endpoint returns user", async () => {
    const res = await fetch(`${ADMIN_URL}/api/auth/get-session`, {
      headers: apiHeaders(sessionCookie),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = (await res.json()) as { user?: { email?: string } };
    if (!body.user?.email) throw new Error(JSON.stringify(body));
  });

  await check("create business via RPC", async () => {
    const res = await fetch(`${ADMIN_URL}/api/rpc`, {
      method: "POST",
      headers: apiHeaders(sessionCookie),
      body: JSON.stringify({
        path: "businesses.admin.bootstrapBusiness",
        args: { name: "Certification Business", timezone: "America/New_York" },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`status ${res.status}: ${text}`);
    }
    const body = (await res.json()) as { result?: string };
    if (!body.result) throw new Error(JSON.stringify(body));
  });

  await check("list businesses", async () => {
    const res = await fetch(`${ADMIN_URL}/api/rpc`, {
      method: "POST",
      headers: apiHeaders(sessionCookie),
      body: JSON.stringify({ path: "businesses.admin.listForCurrentUser", args: {} }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = (await res.json()) as { result?: unknown[] };
    if (!Array.isArray(body.result) || body.result.length === 0) {
      throw new Error("expected at least one business");
    }
  });

  await check("dashboard home page", async () => {
    const res = await fetch(`${ADMIN_URL}/`, {
      headers: { Cookie: sessionCookie },
      redirect: "manual",
    });
    if (res.status >= 500) throw new Error(`status ${res.status}`);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.error("\nFailed checks:");
    for (const f of failed) {
      console.error(`  - ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }
  console.log("\nCertification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
