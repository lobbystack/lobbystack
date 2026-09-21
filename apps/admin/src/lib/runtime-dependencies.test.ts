import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const runtimeRequire = createRequire(new URL("../../.next/server/chunks/runtime-dependency-check.js", import.meta.url));

describe("admin runtime dependencies", () => {
  it.each(["js-tiktoken/lite", "js-tiktoken/ranks/o200k_base"])(
    "resolves %s from the standalone server chunk location",
    (specifier) => {
      expect(runtimeRequire(specifier)).toBeTruthy();
    },
  );
});
