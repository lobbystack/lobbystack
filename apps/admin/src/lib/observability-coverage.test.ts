import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_SRC_ROOT = join(process.cwd(), "src");
const DIRECT_CONVEX_WRITE_HOOK_IMPORT_PATTERN =
  /import\s*\{[\s\S]*?\}\s*from\s*["']convex\/react["'];/g;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe("observability coverage", () => {
  it("routes web Convex writes through observed hooks", () => {
    const offenders: string[] = [];

    for (const file of listSourceFiles(WEB_SRC_ROOT)) {
      if (relative(WEB_SRC_ROOT, file) === "lib/observed-convex.ts") {
        continue;
      }

      const source = readFileSync(file, "utf8");
      const imports = source.matchAll(DIRECT_CONVEX_WRITE_HOOK_IMPORT_PATTERN);
      for (const importStatement of imports) {
        if (/\buse(Action|Mutation)\b/.test(importStatement[0])) {
          offenders.push(relative(WEB_SRC_ROOT, file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
