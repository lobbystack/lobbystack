import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { InstagramApiError, InstagramProvider, splitInstagramText, verifyInstagramWebhookSignature } from "./instagram";

const provider = new InstagramProvider({ appId: "app-id", appSecret: "app-secret", redirectUri: "https://app.example.test/api/integrations/instagram/callback" });

afterEach(() => { vi.unstubAllGlobals(); });

describe("Instagram provider", () => {
  it("asks for business login with only the messaging scopes", () => {
    const url = new URL(provider.buildAuthorizationUrl({ state: "state-1" }));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_messages");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("exchanges the code for a long-lived token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: [{ access_token: "short", user_id: "1", permissions: "instagram_business_basic,instagram_business_manage_messages" }] }))
      .mockResolvedValueOnce(Response.json({ access_token: "long", token_type: "bearer", expires_in: 5_183_944 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider.exchangeCode("code-1#_")).resolves.toEqual({ accessToken: "long", expiresIn: 5_183_944, permissions: ["instagram_business_basic", "instagram_business_manage_messages"] });
    expect(new URLSearchParams(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).get("code")).toBe("code-1");
    const longLivedUrl = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(longLivedUrl.searchParams.get("grant_type")).toBe("ig_exchange_token");
    expect(longLivedUrl.searchParams.get("access_token")).toBe("short");
  });

  it("marks an expired token as needing a reconnect and keeps provider text out of the error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "Error validating access token: customer said hi", type: "OAuthException", code: 190 } }, { status: 400 })));
    const error = await provider.sendTextMessage({ accessToken: "t", instagramUserId: "17841", recipientId: "igsid", text: "Hello" }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(InstagramApiError);
    expect(error).toMatchObject({ reconnectRequired: true, permanent: true, code: 190 });
    expect((error as Error).message).not.toContain("customer");
  });

  it("treats a rate limit as worth retrying", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: 4 } }, { status: 400 })));
    await expect(provider.sendTextMessage({ accessToken: "t", instagramUserId: "1", recipientId: "2", text: "Hi" })).rejects.toMatchObject({ permanent: false, reconnectRequired: false });
  });

  it("sends a text message to the person and returns its ID", async () => {
    const fetchMock = vi.fn(async () => Response.json({ recipient_id: "igsid", message_id: "mid-1" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider.sendTextMessage({ accessToken: "token", instagramUserId: "17841", recipientId: "igsid", text: "Hello" })).resolves.toEqual({ messageId: "mid-1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.instagram.com/v26.0/17841/messages");
    expect(JSON.parse(String(init.body))).toEqual({ recipient: { id: "igsid" }, message: { text: "Hello" } });
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer token");
  });
});

describe("splitInstagramText", () => {
  it("keeps a short reply whole", () => {
    expect(splitInstagramText("  Hello there.  ")).toEqual(["Hello there."]);
  });

  it("splits a long reply at sentence ends, within the byte limit", () => {
    const sentence = "We are open from nine to five on weekdays. ";
    const parts = splitInstagramText(sentence.repeat(40), 200);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(200);
      expect(part.endsWith(".")).toBe(true);
    }
    expect(parts.join(" ")).toBe(sentence.repeat(40).trim());
  });

  it("counts multi-byte characters as bytes", () => {
    const parts = splitInstagramText("ćao ".repeat(100), 50);
    for (const part of parts) expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(50);
  });
});

describe("verifyInstagramWebhookSignature", () => {
  const body = JSON.stringify({ object: "instagram", entry: [] });
  const signature = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;

  it("accepts Meta's signature of the raw body", () => {
    expect(verifyInstagramWebhookSignature(body, signature, "app-secret")).toBe(true);
  });

  it("rejects a missing, malformed or forged signature", () => {
    expect(verifyInstagramWebhookSignature(body, null, "app-secret")).toBe(false);
    expect(verifyInstagramWebhookSignature(body, "sha1=abc", "app-secret")).toBe(false);
    expect(verifyInstagramWebhookSignature(body, signature, "other-secret")).toBe(false);
    expect(verifyInstagramWebhookSignature(`${body} `, signature, "app-secret")).toBe(false);
  });
});
