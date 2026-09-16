import { describe, expect, it } from "vitest";

import { resolveWebCallEndpoint } from "./web-call-endpoint";

describe("resolveWebCallEndpoint", () => {
  it("adds the session route when configuration contains only the gateway origin", () => {
    expect(resolveWebCallEndpoint("http://localhost:3001", "development")).toBe("http://localhost:3001/web-call/sessions");
  });

  it("preserves an explicitly configured session route", () => {
    expect(resolveWebCallEndpoint("https://voice.example.com/web-call/sessions/", "production")).toBe("https://voice.example.com/web-call/sessions");
  });

  it("uses the local session route by default during development", () => {
    expect(resolveWebCallEndpoint(undefined, "development")).toBe("http://127.0.0.1:3001/web-call/sessions");
  });
});
