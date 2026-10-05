import { describe, expect, it } from "vitest";

import { trimTrailingSlashes } from "./index";

describe("trimTrailingSlashes", () => {
  it("removes every trailing slash and keeps the rest", () => {
    expect(trimTrailingSlashes("https://api.openai.com/v1///")).toBe("https://api.openai.com/v1");
    expect(trimTrailingSlashes("/a/b")).toBe("/a/b");
    expect(trimTrailingSlashes("///")).toBe("");
  });

  it("handles a long run of slashes in linear time", () => {
    const value = `x${"/".repeat(200_000)}y`;
    expect(trimTrailingSlashes(value)).toBe(value);
    expect(trimTrailingSlashes(`x${"/".repeat(200_000)}`)).toBe("x");
  });
});
