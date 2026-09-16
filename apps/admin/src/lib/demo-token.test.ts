import { describe, expect, it } from "vitest";

import { secureDemoRedirect } from "./demo-token";

describe("secure demo compatibility redirect", () => {
  it("keeps tokens in the URL fragment and encodes them", () => {
    expect(secureDemoRedirect("token/with spaces" as string)).toBe("/demo#prospect_demo_token=token%2Fwith+spaces");
  });
});
