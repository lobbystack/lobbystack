import { describe, expect, it } from "vitest";

import { assertProductionSecrets } from "./productionSecrets";

describe("assertProductionSecrets", () => {
  it("rejects missing, short, and placeholder production secrets", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "production" }, ["SECRET"])).toThrow("SECRET is required in production");
    expect(() => assertProductionSecrets({ NODE_ENV: "production", SECRET: "too-short" }, ["SECRET"])).toThrow("SECRET must be at least 32 characters");
    expect(() => assertProductionSecrets({ NODE_ENV: "production", SECRET: "replace-with-a-long-production-secret" }, ["SECRET"])).toThrow("SECRET must be at least 32 characters");
  });

  it("accepts strong production secrets and does not constrain development", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "production", SECRET: "a-secure-production-secret-value-123" }, ["SECRET"])).not.toThrow();
    expect(() => assertProductionSecrets({ NODE_ENV: "development", SECRET: "short" }, ["SECRET"])).not.toThrow();
  });
});
