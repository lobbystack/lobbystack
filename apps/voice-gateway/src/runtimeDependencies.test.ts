import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const runtimeRequire = createRequire(new URL("../dist/runtime/index.js", import.meta.url));

describe("voice gateway runtime dependencies", () => {
  it.each(["js-tiktoken/lite", "js-tiktoken/ranks/o200k_base"])(
    "resolves %s from the bundled runtime location",
    (specifier) => {
      expect(runtimeRequire(specifier)).toBeTruthy();
    },
  );
});
