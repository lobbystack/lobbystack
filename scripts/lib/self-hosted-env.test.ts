import { describe, expect, it } from "vitest";

import { getRequiredConvexEnvKeysMissingFromSync } from "./self-hosted-convex-env-keys.mjs";
import {
  isolateSelfHostedConvexCli,
  isPlaceholderValue,
  readEnvFile,
  webCallOriginsIncludeWebUrl,
} from "./self-hosted-env.mjs";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

  it("flags example.com email placeholders", () => {
    expect(isPlaceholderValue("admin@example.com")).toBe(true);
    expect(isPlaceholderValue("noreply@mail.example.com")).toBe(true);
    expect(isPlaceholderValue("ops@mycompany.com")).toBe(false);
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

describe("webCallOriginsIncludeWebUrl", () => {
  it("matches the configured web verify URL", () => {
    expect(
      webCallOriginsIncludeWebUrl(
        "http://127.0.0.1:8080,https://app.example.com",
        "http://127.0.0.1:8080/",
      ),
    ).toBe(true);
    expect(
      webCallOriginsIncludeWebUrl(
        "http://localhost:8080",
        "http://127.0.0.1:8080",
      ),
    ).toBe(false);
  });
});

describe("isolateSelfHostedConvexCli", () => {
  it("restores a stale backup when .env.local is missing", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "self-hosted-cli-"));
    const envLocalPath = join(rootDir, ".env.local");
    const backupPath = `${envLocalPath}.self-hosted-bak`;

    writeFileSync(backupPath, "CONVEX_DEPLOYMENT=dev:backup\n");

    const result = isolateSelfHostedConvexCli({}, () => "ok", { rootDir });

    expect(result).toBe("ok");
    expect(readFileSync(envLocalPath, "utf8")).toBe("CONVEX_DEPLOYMENT=dev:backup\n");
    expect(existsSync(backupPath)).toBe(false);
  });

  it("hides .env.local during the run and restores it afterward", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "self-hosted-cli-"));
    const envLocalPath = join(rootDir, ".env.local");
    const backupPath = `${envLocalPath}.self-hosted-bak`;

    writeFileSync(envLocalPath, "CONVEX_DEPLOYMENT=dev:cloud\n");

    const seenDuringRun = isolateSelfHostedConvexCli({}, () => ({
      hasEnvLocal: existsSync(envLocalPath),
      hasBackup: existsSync(backupPath),
    }), { rootDir });

    expect(seenDuringRun).toEqual({
      hasEnvLocal: false,
      hasBackup: true,
    });
    expect(readFileSync(envLocalPath, "utf8")).toBe("CONVEX_DEPLOYMENT=dev:cloud\n");
    expect(existsSync(backupPath)).toBe(false);
  });
});
