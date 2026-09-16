import { describe, expect, it } from "vitest";

import { playwrightTestSecrets } from "./playwright-test-secrets";

describe("playwrightTestSecrets", () => {
  it("uses explicit fixture signing inputs", () => {
    const secrets = playwrightTestSecrets({ INTERNAL_SERVICE_SECRET: "fixture-signing-secret" }, () => "generated");
    expect(secrets.INTERNAL_SERVICE_SECRET).toBe("fixture-signing-secret");
    expect(secrets.INTERNAL_SERVICE_TOKEN).toBe("generated");
  });

  it("creates a distinct disposable value for every absent secret", () => {
    let sequence = 0;
    const secrets = playwrightTestSecrets({}, () => `generated-${sequence += 1}`);
    expect(new Set(Object.values(secrets)).size).toBe(Object.keys(secrets).length);
  });
});
