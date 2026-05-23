import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyTurnstileForSignUp } from "./turnstile";

describe("verifyTurnstileForSignUp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("posts the token to Cloudflare as form-encoded siteverify data", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await verifyTurnstileForSignUp({
      "cf-turnstile-response": "turnstile-token",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect((init.body as URLSearchParams).get("secret")).toBe("secret-key");
    expect((init.body as URLSearchParams).get("response")).toBe("turnstile-token");
  });

  it("allows local development without a configured secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubGlobal("fetch", vi.fn());

    await expect(
      verifyTurnstileForSignUp({
        "cf-turnstile-response": "turnstile-token",
      }),
    ).resolves.toBeUndefined();

    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires a configured secret outside local development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    vi.stubEnv("CONVEX_SITE_URL", "https://valiant-ibis-521.convex.site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");

    await expect(
      verifyTurnstileForSignUp({
        "cf-turnstile-response": "turnstile-token",
      }),
    ).rejects.toThrow("Turnstile is not configured.");
  });

  it("includes Cloudflare error codes in thrown verification errors", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: false,
            "error-codes": ["invalid-input-response"],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      verifyTurnstileForSignUp({
        "cf-turnstile-response": "turnstile-token",
      }),
    ).rejects.toThrow("Turnstile verification failed: invalid-input-response");
  });
});
