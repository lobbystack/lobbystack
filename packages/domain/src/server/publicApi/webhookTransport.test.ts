import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Webhook } from "standardwebhooks";
import { afterEach, describe, expect, it } from "vitest";

import { isBlockedAddress } from "@lobbystack/providers/crawling/urlSafety";

import { assertWebhookUrlAllowed, createGuardedLookup } from "./webhookNetwork";
import { createWebhookSender, decryptWebhookSecret, encryptWebhookSecret, generateWebhookSecret, signWebhookPayload, webhookHeaders } from "./webhookTransport";

describe("Standard Webhooks signing", () => {
  it("produces signatures the reference standardwebhooks library accepts", () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ id: "evt", type: "appointment.booked", data: { id: "a" } });
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = webhookHeaders({ secret, id: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f", timestamp, body });
    expect(headers["webhook-signature"]).toMatch(/^v1,[A-Za-z0-9+/]+=*$/);
    expect(new Webhook(secret).verify(body, headers)).toEqual(JSON.parse(body));
  });

  it("fails verification when the body or secret changes", () => {
    const secret = generateWebhookSecret();
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = webhookHeaders({ secret, id: "msg_1", timestamp, body: "{\"a\":1}" });
    expect(() => new Webhook(secret).verify("{\"a\":2}", headers)).toThrow();
    expect(() => new Webhook(generateWebhookSecret()).verify("{\"a\":1}", headers)).toThrow();
  });

  it("signs id, timestamp and body together", () => {
    const secret = `whsec_${Buffer.from("k".repeat(32)).toString("base64")}`;
    const signature = signWebhookPayload({ secret, id: "msg", timestamp: 1_700_000_000, body: "{}" });
    expect(signature).toBe(signWebhookPayload({ secret, id: "msg", timestamp: 1_700_000_000, body: "{}" }));
    expect(signature).not.toBe(signWebhookPayload({ secret, id: "msg", timestamp: 1_700_000_001, body: "{}" }));
  });

  it("stores secrets encrypted and reads them back", () => {
    const secret = generateWebhookSecret();
    const encrypted = encryptWebhookSecret(secret);
    expect(encrypted).not.toContain(secret.slice(6));
    expect(decryptWebhookSecret(encrypted)).toBe(secret);
  });
});

describe("SSRF protection", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
    "::1", "fd00:ec2::254", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "64:ff9b::a9fe:a9fe", "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])("allows public address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it("rejects unsafe URLs when an endpoint is saved", () => {
    const production = { allowHttp: false };
    expect(() => assertWebhookUrlAllowed("http://example.com/hook", production)).toThrow(/https/);
    expect(() => assertWebhookUrlAllowed("https://user:pass@example.com/hook", production)).toThrow(/username/);
    expect(() => assertWebhookUrlAllowed("https://localhost/hook", production)).toThrow(/public host/);
    expect(() => assertWebhookUrlAllowed("https://metadata.google.internal/computeMetadata", production)).toThrow(/public host/);
    expect(() => assertWebhookUrlAllowed("https://169.254.169.254/latest/meta-data", production)).toThrow(/public IP/);
    expect(() => assertWebhookUrlAllowed("https://[::1]/hook", production)).toThrow(/public IP/);
    expect(() => assertWebhookUrlAllowed("ftp://example.com", production)).toThrow();
    expect(assertWebhookUrlAllowed("https://hooks.example.com/a?b=1", production).hostname).toBe("hooks.example.com");
    expect(assertWebhookUrlAllowed("http://example.com/hook", { allowHttp: true }).protocol).toBe("http:");
  });

  it("refuses a hostname when DNS returns any private address", async () => {
    const resolveTo = (addresses: string[]) => createGuardedLookup(((_host: string, _options: unknown, callback: (error: null, list: Array<{ address: string; family: number }>) => void) => callback(null, addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })))) as never);
    const lookup = (fn: ReturnType<typeof createGuardedLookup>) => new Promise<{ error: Error | null; address: unknown }>((resolve) => fn("hooks.example.com", {}, (error, address) => resolve({ error, address })));
    expect((await lookup(resolveTo(["169.254.169.254"]))).error?.message).toMatch(/private or reserved/);
    expect((await lookup(resolveTo(["93.184.216.34", "10.0.0.1"]))).error?.message).toMatch(/private or reserved/);
    expect(await lookup(resolveTo(["93.184.216.34"]))).toEqual({ error: null, address: "93.184.216.34" });
  });
});

describe("webhook sender", () => {
  let server: Server | undefined;
  afterEach(async () => { await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())); server = undefined; });

  async function listen(handler: Parameters<typeof createServer>[1]): Promise<number> {
    server = createServer(handler);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    return (server!.address() as AddressInfo).port;
  }

  // Resolves the test hostname to the local server, standing in for public DNS.
  const localLookup = ((_host: string, options: { all?: boolean } | number, callback: (error: null, address: string | Array<{ address: string; family: number }>, family?: number) => void) => (typeof options === "object" && options.all ? callback(null, [{ address: "127.0.0.1", family: 4 }]) : callback(null, "127.0.0.1", 4))) as never;

  it("posts a signed body and treats 2xx as delivered", async () => {
    let received: { headers: Record<string, unknown>; body: string } | undefined;
    const port = await listen((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => { received = { headers: request.headers, body }; response.writeHead(204).end(); });
    });
    const secret = generateWebhookSecret();
    const send = createWebhookSender({ policy: { allowHttp: true }, lookup: localLookup });
    const result = await send({ url: `http://hooks.test:${port}/in`, secret, id: "evt_1", body: "{\"ok\":true}" });
    expect(result).toMatchObject({ ok: true, status: 204, error: null });
    expect(received?.headers["webhook-id"]).toBe("evt_1");
    expect(new Webhook(secret).verify(received!.body, received!.headers as Record<string, string>)).toEqual({ ok: true });
  });

  it("does not follow redirects", async () => {
    let hits = 0;
    const port = await listen((_request, response) => { hits += 1; response.writeHead(302, { location: "http://169.254.169.254/" }).end(); });
    const send = createWebhookSender({ policy: { allowHttp: true }, lookup: localLookup });
    const result = await send({ url: `http://hooks.test:${port}/`, secret: generateWebhookSecret(), id: "evt", body: "{}" });
    expect(result).toMatchObject({ ok: false, status: 302 });
    expect(result.error).toMatch(/Redirects are not followed/);
    expect(hits).toBe(1);
  });

  it("gives up after the timeout", async () => {
    const port = await listen(() => undefined);
    const send = createWebhookSender({ policy: { allowHttp: true }, lookup: localLookup, timeoutMs: 200 });
    const result = await send({ url: `http://hooks.test:${port}/`, secret: generateWebhookSecret(), id: "evt", body: "{}" });
    expect(result).toMatchObject({ ok: false, status: null });
    expect(result.error).toMatch(/Timed out/);
  });

  it("refuses loopback targets with the default DNS guard", async () => {
    const port = await listen((_request, response) => response.writeHead(200).end());
    const send = createWebhookSender({ policy: { allowHttp: true } });
    const viaIp = await send({ url: `http://127.0.0.1:${port}/`, secret: generateWebhookSecret(), id: "evt", body: "{}" });
    expect(viaIp.ok).toBe(false);
    expect(viaIp.error).toMatch(/public IP/);
    const viaName = await send({ url: `http://127.0.0.1.nip.io:${port}/`, secret: generateWebhookSecret(), id: "evt", body: "{}" });
    expect(viaName.ok).toBe(false);
  });
});
