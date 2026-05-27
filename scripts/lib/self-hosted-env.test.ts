import { describe, expect, it } from "vitest";

import {
  getRequiredConvexEnvKeysMissingFromSync,
} from "./self-hosted-convex-env-keys.mjs";
import {
  getSelfHostedOriginMismatches,
  getSelfHostedWebUrlMismatches,
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

describe("getSelfHostedOriginMismatches", () => {
  it("flags placeholder backend origin values", () => {
    expect(
      getSelfHostedOriginMismatches({
        CONVEX_URL: "http://127.0.0.1:3210",
        CONVEX_SITE_URL: "http://127.0.0.1:3211",
        CONVEX_CLOUD_ORIGIN: "https://convex.example.com",
        CONVEX_SITE_ORIGIN: "http://127.0.0.1:3211",
      }),
    ).toEqual([
      "CONVEX_CLOUD_ORIGIN is missing or still a placeholder; set it to match CONVEX_URL (http://127.0.0.1:3210).",
    ]);
  });

  it("flags mismatched backend origin values", () => {
    expect(
      getSelfHostedOriginMismatches({
        CONVEX_URL: "http://127.0.0.1:3210",
        CONVEX_SITE_URL: "http://127.0.0.1:3211",
        CONVEX_CLOUD_ORIGIN: "http://localhost:3210",
        CONVEX_SITE_ORIGIN: "http://127.0.0.1:3211",
      }),
    ).toEqual([
      "CONVEX_CLOUD_ORIGIN (http://localhost:3210) must match CONVEX_URL (http://127.0.0.1:3210).",
    ]);
  });

  it("accepts aligned origin values", () => {
    expect(
      getSelfHostedOriginMismatches({
        CONVEX_URL: "http://127.0.0.1:3210",
        CONVEX_SITE_URL: "http://127.0.0.1:3211",
        CONVEX_CLOUD_ORIGIN: "http://127.0.0.1:3210",
        CONVEX_SITE_ORIGIN: "http://127.0.0.1:3211/",
      }),
    ).toEqual([]);
  });
});

describe("getSelfHostedWebUrlMismatches", () => {
  it("flags localhost versus 127.0.0.1 origin mismatches", () => {
    expect(
      getSelfHostedWebUrlMismatches(
        {
          APP_BASE_URL: "http://127.0.0.1:8080",
          SITE_URL: "http://127.0.0.1:8080",
          WEB_CALL_ALLOWED_ORIGINS: "http://localhost:8080",
        },
        "http://127.0.0.1:8080",
      ),
    ).toEqual([
      "WEB_CALL_ALLOWED_ORIGINS includes http://localhost:8080, but the web verify URL uses http://127.0.0.1:8080; localhost and 127.0.0.1 must match exactly.",
    ]);
  });
});

describe("isolateSelfHostedConvexCli", () => {
  it("restores a stale backup when .env.local is missing", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "self-hosted-cli-"));
    const envLocalPath = join(rootDir, ".env.local");
    const backupPath = `${envLocalPath}.self-hosted-bak`;

    writeFileSync(backupPath, "CONVEX_DEPLOYMENT=dev:backup\n");

    const result = await isolateSelfHostedConvexCli({}, () => "ok", { rootDir });

    expect(result).toBe("ok");
    expect(readFileSync(envLocalPath, "utf8")).toBe("CONVEX_DEPLOYMENT=dev:backup\n");
    expect(existsSync(backupPath)).toBe(false);
  });

  it("hides .env.local during the run and restores it afterward", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "self-hosted-cli-"));
    const envLocalPath = join(rootDir, ".env.local");
    const backupPath = `${envLocalPath}.self-hosted-bak`;

    writeFileSync(envLocalPath, "CONVEX_DEPLOYMENT=dev:cloud\n");

    const seenDuringRun = await isolateSelfHostedConvexCli({}, () => ({
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

  it("waits for async callbacks before restoring .env.local", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "self-hosted-cli-"));
    const envLocalPath = join(rootDir, ".env.local");
    const backupPath = `${envLocalPath}.self-hosted-bak`;

    writeFileSync(envLocalPath, "CONVEX_DEPLOYMENT=dev:cloud\n");

    const seenDuringRun = await isolateSelfHostedConvexCli(
      {},
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          hasEnvLocal: existsSync(envLocalPath),
          hasBackup: existsSync(backupPath),
        };
      },
      { rootDir },
    );

    expect(seenDuringRun).toEqual({
      hasEnvLocal: false,
      hasBackup: true,
    });
    expect(readFileSync(envLocalPath, "utf8")).toBe("CONVEX_DEPLOYMENT=dev:cloud\n");
  });
});
