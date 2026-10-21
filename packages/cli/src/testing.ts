import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { vi } from "vitest";

import { main } from "./main";

// Helpers for the command tests: a fake API that answers by method and path,
// and a runner that captures what a command prints and its exit code.

export const KEY = "lsp_1a2b3c4d_abcdefghijklmnopqrstuvwxyzABCDEF";
export const BUSINESS = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";

export type Sent = { method: string; path: string; query: Record<string, string>; headers: Record<string, string>; body: unknown; redirect: RequestRedirect | undefined };
type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
type Route = Reply | ((request: Sent) => Reply);

/** A fake fetch. Routes are "GET /api/v1/rules"; each may answer the same way every time, or vary by request. */
export function fakeApi(routes: Record<string, Route | Route[]>) {
  const sent: Sent[] = [];
  const queues = new Map(Object.entries(routes).map(([route, reply]) => [route, Array.isArray(reply) ? [...reply] : reply]));
  const fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as unknown : init?.body;
    const request: Sent = { method: init?.method ?? "GET", path: url.pathname, query: Object.fromEntries(url.searchParams), headers, body, redirect: init?.redirect };
    sent.push(request);
    const route = `${request.method} ${url.origin === "https://app.example.com" ? url.pathname : url.href}`;
    const entry = queues.get(route);
    if (!entry) return new Response(JSON.stringify({ error: { code: "not_found", message: `No fake for ${route}.` } }), { status: 404 });
    const next = Array.isArray(entry) ? (entry.length > 1 ? entry.shift()! : entry[0]!) : entry;
    const reply = typeof next === "function" ? next(request) : next;
    return new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json", ...reply.headers } });
  });
  return { fetch, sent };
}

export async function tempDir(): Promise<{ path: string; remove(): Promise<void> }> {
  const path = await mkdtemp(join(tmpdir(), "lobbystack-cli-"));
  return { path, remove: () => rm(path, { recursive: true, force: true }) };
}

/** Runs the CLI against the fake API, logged in through the environment unless env says otherwise. */
export async function runCli(argv: string[], options: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv; configHome?: string } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main({
    argv,
    env: { XDG_CONFIG_HOME: options.configHome ?? join(tmpdir(), "lobbystack-cli-unused"), LOBBYSTACK_URL: "https://app.example.com", LOBBYSTACK_API_KEY: KEY, LOBBYSTACK_BUSINESS: BUSINESS, ...options.env },
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    sleep: async () => undefined,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}
