import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyTurnstileForSignUp } from "./turnstile";

const originalBaseUrl = process.env.APP_BASE_URL;
const originalSecret = process.env.TURNSTILE_SECRET_KEY;

afterEach(() => {
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

    await expect(verifyTurnstileForSignUp({})).resolves.toBeUndefined();
  });

  it("requires a token outside local development", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.com");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");

    await expect(verifyTurnstileForSignUp({})).rejects.toThrow("required");
  });

  it("accepts a successful Cloudflare response", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.com");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyTurnstileForSignUp({ token: "token", remoteIp: "203.0.113.10" })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("https://challenges.cloudflare.com/turnstile/v0/siteverify", expect.objectContaining({ method: "POST" }));
  });
});
