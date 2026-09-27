import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { apiKeyScopes, apiOperations, buildOpenApiDocument, webhookEventTypes } from "@lobbystack/shared";
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

  it("requires a declared scope on every operation", () => {
    for (const operation of Object.values(apiOperations)) expect(apiKeyScopes).toContain(operation.scope);
  });

  it("generates an OpenAPI 3.1 document with paths, scopes and webhooks", () => {
    const document = buildOpenApiDocument({ serverUrl: "https://app.lobbystack.com/api/v1" }) as { openapi: string; paths: Record<string, Record<string, { "x-required-scope": string }>>; webhooks: Record<string, unknown>; components: { schemas: Record<string, unknown> } };
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths["/appointments"]?.post?.["x-required-scope"]).toBe("appointments:write");
    expect(Object.keys(document.webhooks).sort()).toEqual([...webhookEventTypes, "webhook.test"].sort());
    expect(document.components.schemas.Appointment).toBeDefined();
    expect(JSON.stringify(document)).not.toContain("\"pattern\":\"^([0-9a-fA-F]{8}");
  });

  it("keeps the committed Mintlify OpenAPI file in sync with the schemas", () => {
    const committed = JSON.parse(readFileSync(`${repositoryRoot}mintlify/api-reference/openapi.json`, "utf8")) as unknown;
    const generated = buildOpenApiDocument({ serverUrl: "https://app.lobbystack.com/api/v1" });
    expect(committed, "Run pnpm api:openapi to regenerate mintlify/api-reference/openapi.json.").toEqual(JSON.parse(JSON.stringify(generated)));
  });
});
