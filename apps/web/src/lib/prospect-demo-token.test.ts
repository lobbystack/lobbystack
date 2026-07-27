import { beforeEach, describe, expect, it } from "vitest";

import {
  clearStoredProspectDemoToken,
  getStoredProspectDemoToken,
  scrubProspectDemoTokenFromLocation,
} from "./prospect-demo-token";

describe("prospect demo token location scrubbing", () => {
  beforeEach(() => {
    clearStoredProspectDemoToken();
  });

  it("stores fragment tokens and removes them from new demo links", () => {
    window.history.replaceState(
      null,
      "",
      "/demo?via=partner#prospect_demo_token=acme-secret",
    );

    scrubProspectDemoTokenFromLocation();

    expect(getStoredProspectDemoToken()).toBe("acme-secret");
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      "/demo?via=partner",
    );
  });

  it("accepts and scrubs legacy demo paths", () => {
    window.history.replaceState(null, "", "/demo/acme-secret?via=partner");

    scrubProspectDemoTokenFromLocation();

    expect(getStoredProspectDemoToken()).toBe("acme-secret");
    expect(`${window.location.pathname}${window.location.search}`).toBe(
      "/demo?via=partner",
    );
  });

  it("scrubs nested claim tokens from authentication return paths", () => {
    window.history.replaceState(
      null,
      "",
      "/signup?returnTo=%2Fclaim-demo%3Ftoken%3Dacme-secret",
    );

    scrubProspectDemoTokenFromLocation();

    expect(getStoredProspectDemoToken()).toBe("acme-secret");
    expect(window.location.pathname + window.location.search).toBe(
      "/signup?returnTo=%2Fclaim-demo",
    );
  });
});
