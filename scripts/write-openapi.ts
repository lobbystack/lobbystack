import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildOpenApiDocument } from "../packages/shared/src/publicApi/operations";

// Writes the v1 OpenAPI document that the Mintlify API reference renders.
// A test in apps/admin fails when this file falls behind the zod schemas.
const target = fileURLToPath(new URL("../mintlify/api-reference/openapi.json", import.meta.url));
writeFileSync(target, `${JSON.stringify(buildOpenApiDocument({ serverUrl: "https://app.lobbystack.com/api/v1" }), null, 2)}\n`);
console.log(`Wrote ${target}`);
