import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { isAllowedUploadContentType } from "@lobbystack/contracts";
import { apiKeyScopes, apiOperations, apiScopesInUse, buildOpenApiDocument, businessApiKeyScopes, knowledgeUploadContentTypes, oauthGrantableScopes, offeredApiKeyScopes, offeredPartnerPlatformKeyScopes, partnerOwnerScopes, partnerScopes, platformOnlyScopes, webhookEventTypes, type ApiOperation } from "@lobbystack/shared";
import { describe, expect, it } from "vitest";

const adminRoot = fileURLToPath(new URL("../../../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

describe("v1 contract", () => {
  it("binds every documented operation to its route file and method", () => {
    for (const [operationId, operation] of Object.entries(apiOperations)) {
      const directory = operation.path.replace(/\{([a-z_]+)\}/g, "[$1]");
      const file = `${adminRoot}app/api/v1${directory}/route.ts`;
      expect(existsSync(file), `${operationId}: ${file}`).toBe(true);
      expect(readFileSync(file, "utf8")).toContain(`export const ${operation.method} = v1.${operationId};`);
    }
  });

  it("requires a declared scope on every operation except the key check", () => {
    for (const [operationId, operation] of Object.entries(apiOperations)) {
      if (operationId === "getMe") expect(operation.scope).toBeNull();
      else expect(apiKeyScopes).toContain(operation.scope);
    }
  });

  it("generates an OpenAPI 3.1 document with paths, scopes and webhooks", () => {
    const document = buildOpenApiDocument({ serverUrl: "https://app.lobbystack.com/api/v1" }) as { openapi: string; paths: Record<string, Record<string, { "x-required-scope": string }>>; webhooks: Record<string, unknown>; components: { schemas: Record<string, unknown> } };
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths["/appointments"]?.post?.["x-required-scope"]).toBe("appointments:write");
    expect(Object.keys(document.webhooks).sort()).toEqual([...webhookEventTypes, "webhook.test"].sort());
    expect(document.components.schemas.Appointment).toBeDefined();
    expect(JSON.stringify(document)).not.toContain("\"pattern\":\"^([0-9a-fA-F]{8}");
  });

  it("documents the LobbyStack-Business header on every operation that acts on a business", () => {
    const document = buildOpenApiDocument({ serverUrl: "https://app.lobbystack.com/api/v1" }) as { paths: Record<string, Record<string, { parameters?: Array<{ name: string; in: string; required?: boolean; description: string }> }>> };
    for (const operation of Object.values(apiOperations) as ApiOperation[]) {
      const header = document.paths[operation.path]?.[operation.method.toLowerCase()]?.parameters?.find((parameter) => parameter.name === "LobbyStack-Business");
      if (operation.business === "none") {
        expect(header, `${operation.method} ${operation.path}`).toBeUndefined();
        continue;
      }
      expect(header, `${operation.method} ${operation.path}`).toMatchObject({ in: "header" });
      expect(header?.required).toBeUndefined();
      expect(header?.description).toContain(operation.path === "/me" ? "Optional here" : "Required with a platform key");
    }
  });

  it("puts platform-only scopes only on platform operations, which act on no one business", () => {
    for (const [operationId, operation] of Object.entries(apiOperations) as Array<[string, ApiOperation]>) {
      if (operation.scope && platformOnlyScopes.includes(operation.scope as never)) expect(operation.business, operationId).toBe("none");
      if (operation.business === "none") expect(["Platform", "Partner"], operationId).toContain(operation.tag);
    }
  });

  it("puts every Partner endpoint behind a partner scope, with no business header", () => {
    const partnerOperations = Object.entries(apiOperations).filter(([, operation]) => operation.tag === "Partner") as Array<[string, ApiOperation]>;
    expect(partnerOperations.length).toBeGreaterThan(30);
    for (const [operationId, operation] of partnerOperations) {
      expect(operation.business, operationId).toBe("none");
      expect(partnerScopes, operationId).toContain(operation.scope);
    }
    // Every partner scope guards at least one endpoint, and no other endpoint takes one.
    for (const scope of partnerScopes) expect(partnerOperations.some(([, operation]) => operation.scope === scope), scope).toBe(true);
    for (const operation of Object.values(apiOperations) as ApiOperation[]) if (operation.tag !== "Partner") expect(partnerScopes).not.toContain(operation.scope);
    // The partner console offers them all, and only owners grant the billing ones.
    for (const scope of partnerScopes) expect(offeredPartnerPlatformKeyScopes).toContain(scope);
    expect([...partnerOwnerScopes]).toEqual(["partner.billing:read", "partner.billing:write"]);
    const partner = JSON.parse(readFileSync(`${adminRoot}public/locales/en/partner.json`, "utf8")) as { apiKeys: { scopes: Record<string, string> } };
    for (const scope of offeredPartnerPlatformKeyScopes) expect(partner.apiKeys.scopes[scope.replace(/[.:]/g, "_")], scope).toEqual(expect.any(String));
  });

  it("accepts for API uploads only file types the storage layer accepts for knowledge", () => {
    for (const contentType of knowledgeUploadContentTypes) expect(isAllowedUploadContentType("knowledge", contentType), contentType).toBe(true);
  });

  it("publishes the business type and onboarding stage on the Business object", () => {
    const document = buildOpenApiDocument({ serverUrl: "https://app.lobbystack.com/api/v1" }) as { components: { schemas: Record<string, { required?: string[]; properties: Record<string, unknown> }> } };
    expect(document.components.schemas.Business?.required).toEqual(expect.arrayContaining(["business_type", "onboarding_stage"]));
    expect(document.components.schemas.BusinessUpdate?.properties).toHaveProperty("business_type");
  });

  it("requires an Idempotency-Key on POST /businesses and documents it", () => {
    expect(apiOperations.createBusiness).toMatchObject({ idempotent: "required", business: "none", scope: "businesses:create" });
    const document = buildOpenApiDocument({ serverUrl: "https://app.lobbystack.com/api/v1" }) as { paths: Record<string, Record<string, { parameters?: Array<{ name: string; required?: boolean }> }>> };
    expect(document.paths["/businesses"]?.post?.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", required: true }));
  });

  it("keeps platform-only scopes off per-business keys, OAuth grants and Settings", () => {
    expect([...platformOnlyScopes]).toEqual(["businesses:create", "users:create", ...partnerScopes]);
    for (const scope of platformOnlyScopes) {
      expect(apiKeyScopes).toContain(scope);
      expect(businessApiKeyScopes).not.toContain(scope);
      expect(oauthGrantableScopes).not.toContain(scope);
    }
    // MCP has no tools for the onboarding scopes, so OAuth clients are offered the same scopes as before.
    expect([...oauthGrantableScopes]).toEqual(["business:read", "business:write", "calls:read", "contacts:read", "contacts:write", "appointments:read", "appointments:write", "messages:read", "knowledge:write"]);
  });

  it("offers in Settings only per-business scopes an endpoint uses, each with a label", () => {
    expect(offeredApiKeyScopes.every((scope) => apiScopesInUse.includes(scope) && businessApiKeyScopes.includes(scope))).toBe(true);
    for (const scope of apiScopesInUse) if (!platformOnlyScopes.includes(scope as never)) expect(offeredApiKeyScopes).toContain(scope);
    const settings = JSON.parse(readFileSync(`${adminRoot}public/locales/en/settings.json`, "utf8")) as { apiKeys: { scopes: Record<string, string> } };
    for (const scope of offeredApiKeyScopes) expect(settings.apiKeys.scopes[scope.replace(":", "_")], scope).toEqual(expect.any(String));
  });

  it("keeps the committed Mintlify OpenAPI file in sync with the schemas", () => {
    const committed = JSON.parse(readFileSync(`${repositoryRoot}mintlify/api-reference/openapi.json`, "utf8")) as unknown;
    const generated = buildOpenApiDocument({ serverUrl: "https://app.lobbystack.com/api/v1" });
    expect(committed, "Run pnpm api:openapi to regenerate mintlify/api-reference/openapi.json.").toEqual(JSON.parse(JSON.stringify(generated)));
  });
});
