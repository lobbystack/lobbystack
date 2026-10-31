import { describe, expect, it } from "vitest";

import { keepPreviousForBusiness } from "./keep-previous-for-business";

describe("keepPreviousForBusiness", () => {
  const previous = { rows: [1] };

  it("keeps the previous data for the same business", () => {
    expect(keepPreviousForBusiness<typeof previous>("a")(previous, { queryKey: ["contacts", "a", "search", 0] })).toBe(previous);
  });

  it("drops it once the active business has changed", () => {
    expect(keepPreviousForBusiness<typeof previous>("b")(previous, { queryKey: ["contacts", "a", "search", 0] })).toBeUndefined();
  });

  it("has nothing to keep before the first load", () => {
    expect(keepPreviousForBusiness<typeof previous>("a")(undefined, undefined)).toBeUndefined();
  });
});
