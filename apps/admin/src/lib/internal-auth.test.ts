import { afterEach, describe, expect, it } from "vitest";

import { buildInternalHeaders, claimInternalRequestNonce, verifyInternalRequest } from "./internal-auth";

const originalSecret = process.env.INTERNAL_SERVICE_SECRET;
const originalServiceId = process.env.INTERNAL_SERVICE_ID;
const originalRedisUrl = process.env.REDIS_URL;
const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as unknown as Record<string, string | undefined>;

afterEach(() => {
  if (originalSecret === undefined) Reflect.deleteProperty(mutableEnv, "INTERNAL_SERVICE_SECRET");
  else mutableEnv.INTERNAL_SERVICE_SECRET = originalSecret;
  if (originalServiceId === undefined) Reflect.deleteProperty(mutableEnv, "INTERNAL_SERVICE_ID");
  else mutableEnv.INTERNAL_SERVICE_ID = originalServiceId;
  if (originalRedisUrl === undefined) Reflect.deleteProperty(mutableEnv, "REDIS_URL");
  else mutableEnv.REDIS_URL = originalRedisUrl;
  if (originalNodeEnv === undefined) Reflect.deleteProperty(mutableEnv, "NODE_ENV");
  else mutableEnv.NODE_ENV = originalNodeEnv;
});

describe("internal request authentication", () => {
  it("verifies signed requests without throwing on malformed signatures", () => {
    process.env.INTERNAL_SERVICE_SECRET = "test-secret";
    process.env.INTERNAL_SERVICE_ID = "test-service";
    const body = JSON.stringify({ callId: "call-1" });
    const headers = buildInternalHeaders({ serviceId: "test-service", body });

    const signed = { serviceId: headers["x-service-id"]!, timestamp: headers["x-service-timestamp"]!, nonce: headers["x-service-nonce"]!, bodyHash: headers["x-body-sha256"]!, signature: headers["x-service-signature"]! };
    expect(verifyInternalRequest({ ...signed, body })).toBe(true);
    expect(verifyInternalRequest({ ...signed, signature: "z".repeat(64), body })).toBe(false);
  });

  it("claims each nonce once when Redis is not configured outside production", async () => {
    Reflect.deleteProperty(mutableEnv, "REDIS_URL");
    mutableEnv.NODE_ENV = "test";

    expect(await claimInternalRequestNonce({ serviceId: "test-service", nonce: "nonce-1", maxAgeMs: 10_000 })).toBe("claimed");
    expect(await claimInternalRequestNonce({ serviceId: "test-service", nonce: "nonce-1", maxAgeMs: 10_000 })).toBe("replayed");
  });

  it("fails closed when production has no replay store", async () => {
    Reflect.deleteProperty(mutableEnv, "REDIS_URL");
    mutableEnv.NODE_ENV = "production";

    expect(await claimInternalRequestNonce({ serviceId: "test-service", nonce: "nonce-production", maxAgeMs: 10_000 })).toBe("unavailable");
  });
});
