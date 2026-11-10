import { describe, expect, it } from "vitest";

import { greetingName } from "./emailGreeting";

describe("greetingName", () => {
  it("greets by the first name someone gave", () => {
    expect(greetingName("Ryan Tremblay", "ryan@metroprint.ca")).toBe("Ryan");
    expect(greetingName("  Sam ", "owner@example.test")).toBe("Sam");
  });

  it("greets nobody by the name sign-up took from the email address", () => {
    expect(greetingName("raphael.morency", "raphael.morency@icloud.com")).toBe("");
    expect(greetingName("Hello", "hello@lobbystack.com")).toBe("");
  });

  it("greets nobody without a name", () => {
    expect(greetingName(null, "owner@example.test")).toBe("");
    expect(greetingName("  ", "owner@example.test")).toBe("");
  });
});
