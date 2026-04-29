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

const sourceModules = {
  ...import.meta.glob("../**/*.{ts,tsx}", {
    eager: true,
    import: "default",
    query: "?raw",
  }),
  ...import.meta.glob("../../features/**/*.{ts,tsx}", {
    eager: true,
    import: "default",
    query: "?raw",
  }),
} as Record<string, string>;

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
