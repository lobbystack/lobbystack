import { describe, expect, it } from "vitest";

import { webCallConnectSource } from "./csp";

describe("webCallConnectSource", () => {
  it("allows only the configured web-call origin", () => {
    expect(
      webCallConnectSource({
        NEXT_PUBLIC_WEB_CALL_ENDPOINT:
          "http://localhost:3001/web-call/sessions",
      }),
    ).toBe("http://localhost:3001");
  });

  it("does not add malformed or same-origin relative values", () => {
    expect(
      webCallConnectSource({
        NEXT_PUBLIC_WEB_CALL_ENDPOINT: "/api/voice",
      }),
    ).toBeUndefined();
  });
});
