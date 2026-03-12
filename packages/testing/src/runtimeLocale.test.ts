import { describe, expect, it } from "vitest";

import {
  classifyRuntimeLocale,
  detectExplicitRuntimeLocaleRequest,
  resolveRuntimeLocale,
} from "../../../convex/lib/runtimeLocale";

describe("runtime locale detection", () => {
  it("classifies clearly French text as French", () => {
    expect(classifyRuntimeLocale("Bonjour, avez-vous un rendez-vous demain à 16h?")).toBe("fr");
  });

  it("classifies clearly English text as English", () => {
    expect(classifyRuntimeLocale("What time do you close on Friday?")).toBe("en");
  });

  it("honors explicit language switch requests", () => {
    expect(detectExplicitRuntimeLocaleRequest("Pouvez-vous répondre en français?")).toBe("fr");
    expect(detectExplicitRuntimeLocaleRequest("Please answer in English.")).toBe("en");
  });

  it("treats short ambiguous messages as unknown", () => {
    expect(classifyRuntimeLocale("bonjour")).toBe("unknown");
    expect(classifyRuntimeLocale("merci")).toBe("unknown");
    expect(classifyRuntimeLocale("ok")).toBe("unknown");
  });

  it("falls back to English when a stored runtime locale is missing", () => {
    expect(resolveRuntimeLocale(undefined)).toBe("en");
    expect(resolveRuntimeLocale(null)).toBe("en");
  });
});
