import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { publicAssetVersion } from "./asset-version";

function publicDir(translation: string): string {
  const root = mkdtempSync(join(tmpdir(), "asset-version-"));
  mkdirSync(join(root, "locales/en"), { recursive: true });
  writeFileSync(join(root, "locales/en/affiliate.json"), translation);
  writeFileSync(join(root, "lobbystack-logo.svg"), "<svg />");
  return root;
}

describe("publicAssetVersion", () => {
  it("changes when a translation changes, even if the deployment version does not", () => {
    const before = publicAssetVersion(publicDir('{"title":"Affiliate program"}'), "faac87ba");
    const after = publicAssetVersion(publicDir('{"title":"Affiliate program","new":"Key"}'), "faac87ba");
    expect(before).toMatch(/^[0-9a-f]{16}$/);
    expect(after).not.toBe(before);
  });

  it("is stable for identical content", () => {
    expect(publicAssetVersion(publicDir("{}"), "a")).toBe(publicAssetVersion(publicDir("{}"), "b"));
  });

  it("falls back when there are no versioned files", () => {
    expect(publicAssetVersion(mkdtempSync(join(tmpdir(), "asset-version-empty-")), "fallback")).toBe("fallback");
  });

  it("covers the real admin public directory", () => {
    expect(publicAssetVersion(join(process.cwd(), "public"), "fallback")).not.toBe("fallback");
  });
});
