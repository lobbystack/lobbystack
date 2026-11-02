import { describe, expect, it } from "vitest";

import { parseTextRepliesArgs } from "./text-replies";

describe("pnpm text-replies:set", () => {
  it("turns one business on or off", () => {
    expect(parseTextRepliesArgs(["--business", "business", "--on"])).toEqual({ kind: "set", businessId: "business", enabled: true });
    expect(parseTextRepliesArgs(["--business", "business", "--off"])).toEqual({ kind: "set", businessId: "business", enabled: false });
  });

  it("refuses a command that doesn't say which business or which way", () => {
    expect(parseTextRepliesArgs(["--on"])).toEqual({ kind: "usage", exitCode: 1 });
    expect(parseTextRepliesArgs(["--business", "business"])).toEqual({ kind: "usage", exitCode: 1 });
    expect(parseTextRepliesArgs(["--business", "business", "--on", "--off"])).toEqual({ kind: "usage", exitCode: 1 });
  });
});
