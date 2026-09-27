import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";

import { apiJsonSchemaFor } from "@lobbystack/shared";

// The v1 contract schemas in @lobbystack/shared are built with an older zod
// that the MCP SDK cannot convert. This adapter publishes them as Standard
// Schema with JSON Schema attached, so tool output schemas are the same
// documents the OpenAPI spec publishes, and results are checked against them.

type ContractSchema = Parameters<typeof apiJsonSchemaFor>[0];

export function contractSchema<T = Record<string, unknown>>(schema: ContractSchema): StandardSchemaWithJSON<T, T> {
  const json = apiJsonSchemaFor(schema, "output");
  return {
    "~standard": {
      version: 1,
      vendor: "lobbystack",
      validate(value: unknown) {
        const result = schema.safeParse(value);
        if (result.success) return { value: result.data as T };
        return { issues: result.error.issues.map((issue) => ({ message: issue.message, path: issue.path.map((part) => (typeof part === "symbol" ? String(part) : part)) })) };
      },
      jsonSchema: {
        input: () => json,
        output: () => json,
      },
    },
  };
}
