import { afterEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ headers: null as Headers | null }));
// Outside a request, next/headers throws.
vi.mock("next/headers", () => ({ headers: async () => {
  if (!request.headers) throw new Error("`headers` was called outside a request scope.");
  return request.headers;
} }));

import { verifyTurnstile } from "./turnstile";

const originalBaseUrl = process.env.APP_BASE_URL;
const originalSecret = process.env.TURNSTILE_SECRET_KEY;

afterEach(() => {
  request.headers = null;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (originalBaseUrl === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = originalBaseUrl;
  if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = originalSecret;
});

describe("replacement Turnstile verification", () => {
  it("allows local development without a secret", async () => {
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");

    await expect(verifyTurnstile({})).resolves.toBeUndefined();
  });

  it("requires a token outside local development", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.com");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");

    await expect(verifyTurnstile({})).rejects.toThrow("required");
  });

  it("accepts a successful Cloudflare response", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.com");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyTurnstile({ token: "token", remoteIp: "203.0.113.10" })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("https://challenges.cloudflare.com/turnstile/v0/siteverify", expect.objectContaining({ method: "POST" }));
  });

  it("accepts a challenge solved on a partner's host only on that host, once the proxy resolved it", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.com");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const solvedOn = (hostname: string) => vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, hostname }), { status: 200 }));
    request.headers = new Headers({ "x-lobbystack-brand": "partner:5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11", "x-lobbystack-brand-origin": "https://bright.portal.example.com" });
    vi.stubGlobal("fetch", solvedOn("bright.portal.example.com"));
    await expect(verifyTurnstile({ token: "token" })).resolves.toBeUndefined();
    for (const hostname of ["other.portal.example.com", "app.example.com"]) {
      vi.stubGlobal("fetch", solvedOn(hostname));
      await expect(verifyTurnstile({ token: "token" }), hostname).rejects.toThrow("Turnstile verification failed.");
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })));
    await expect(verifyTurnstile({ token: "token" })).rejects.toThrow("Turnstile verification failed.");

    // The host's own domain checks what it always has.
    request.headers = new Headers({ "x-lobbystack-brand": "host" });
    vi.stubGlobal("fetch", solvedOn("app.example.com"));
    await expect(verifyTurnstile({ token: "token" })).resolves.toBeUndefined();
  });
});
