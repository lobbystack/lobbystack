import { describe, expect, it } from "vitest";

import { getRequiredConvexEnvKeysMissingFromSync } from "./self-hosted-convex-env-keys.mjs";
import { isPlaceholderValue, readEnvFile } from "./self-hosted-env.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("self-hosted convex env keys", () => {
  it("syncs every required deployment env key into Convex", () => {
    expect(getRequiredConvexEnvKeysMissingFromSync()).toEqual([]);
  });
});

describe("isPlaceholderValue", () => {
  it("flags example.com hosts without matching unrelated substrings", () => {
    expect(isPlaceholderValue("https://app.example.com")).toBe(true);
    expect(isPlaceholderValue("convex-site.example.com")).toBe(true);
    expect(isPlaceholderValue("https://voice.mycompany.com")).toBe(false);
    expect(isPlaceholderValue("not-a-url-with-example.com-in-path")).toBe(false);
  });
});

describe("readEnvFile", () => {
  it("parses quoted values with escapes", () => {
    const dir = mkdtempSync(join(tmpdir(), "self-hosted-env-"));
    const envFile = join(dir, ".env.self-hosted");
    writeFileSync(
      envFile,
      [
        'SESSION_ENCRYPTION_KEY="abc\\"def"',
        "INSTANCE_SECRET=deadbeef",
        "",
      ].join("\n"),
    );

    expect(readEnvFile(envFile)).toEqual({
      SESSION_ENCRYPTION_KEY: 'abc"def',
      INSTANCE_SECRET: "deadbeef",
    });
  });
});
