import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenSurfacePatterns = [
  {
    pattern: /rounded-xl\s+border\s+bg-card/,
    reason: "Use Surface, Card, or TableCard instead of hand-written card borders.",
  },
  {
    allowedFiles: ["./surface.tsx"],
    pattern: /rounded-xl\s+border\s+border-border\s+bg-card/,
    reason: "Use Surface, Card, or TableCard instead of duplicating the shared surface class.",
  },
  {
    pattern: /ring-1\s+ring-foreground\/10/,
    reason: "Operator surfaces use the shared border surface, not ring outlines.",
  },
];

const componentsDirectory = fileURLToPath(new URL("../", import.meta.url));
const sourceModules = Object.fromEntries(readdirSync(componentsDirectory, { recursive: true })
  .filter((entry): entry is string => typeof entry === "string" && /\.tsx?$/.test(entry) && !entry.includes(".test."))
  .map((entry) => [entry === "ui/surface.tsx" ? "./surface.tsx" : entry, readFileSync(join(componentsDirectory, entry), "utf8")]));

describe("surface styling", () => {
  it("keeps operator surface outlines routed through shared primitives", () => {
    const violations = Object.entries(sourceModules).flatMap(([file, source]) =>
      forbiddenSurfacePatterns
        .filter(({ allowedFiles, pattern }) => !allowedFiles?.includes(file) && pattern.test(source))
        .map(({ reason }) => `${file}: ${reason}`),
    );

    expect(violations).toEqual([]);
  });
});
