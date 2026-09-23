import { describe, expect, it } from "vitest";

import { billingPlanCatalog } from "./billing";
import {
  cloudPlanFactSheets,
  getCloudPlanFactSheet,
  isProductCapabilityRestricted,
  isWidgetKeyIssuanceEnabled,
  productCapabilityIds,
  productCapabilities,
} from "./product-capabilities";

describe("product capability metadata", () => {
  it("marks website chat restricted and telephone voice available", () => {
    expect(isProductCapabilityRestricted("website_chat")).toBe(true);
    expect(isProductCapabilityRestricted("telephone_voice")).toBe(false);
    expect(isProductCapabilityRestricted("browser_voice_testing")).toBe(false);
  });

  it("keeps every declared capability typed and accounted for", () => {
    expect(Object.keys(productCapabilities).sort()).toEqual(
      [...productCapabilityIds].sort(),
    );
    for (const id of productCapabilityIds) {
      expect(productCapabilities[id].id).toBe(id);
    }
  });
});

describe("cloud plan fact sheets", () => {
  it("derives Free voice minutes and telephone-number facts from the billing catalog", () => {
    const free = getCloudPlanFactSheet("free_cloud");
    expect(free.voiceMinutesIncluded).toBe(
      billingPlanCatalog.free_cloud.voiceSecondsIncluded! / 60,
    );
    expect(free.voiceMinutesIncluded).toBe(30);
    expect(free.dedicatedBusinessNumbers).toBe(0);
    expect(free.browserVoiceOnly).toBe(true);
  });

  it("treats paid plans as telephone-number plans", () => {
    for (const slug of ["starter", "pro"] as const) {
      const facts = getCloudPlanFactSheet(slug);
      expect(facts.dedicatedBusinessNumbers).toBe(1);
      expect(facts.browserVoiceOnly).toBe(false);
    }
  });

  it("keeps Enterprise allowances null instead of inventing values", () => {
    const enterprise = getCloudPlanFactSheet("enterprise");
    expect(enterprise.voiceMinutesIncluded).toBeNull();
    expect(enterprise.dedicatedBusinessNumbers).toBeNull();
    expect(enterprise.browserVoiceOnly).toBe(false);
  });

  it("indexes every hosted plan", () => {
    expect(Object.keys(cloudPlanFactSheets).sort()).toEqual(
      ["enterprise", "free_cloud", "pro", "starter"],
    );
  });
});

describe("widget key issuance gate", () => {
  it("is disabled by default while website chat is restricted", () => {
    expect(isWidgetKeyIssuanceEnabled()).toBe(false);
    expect(isWidgetKeyIssuanceEnabled({})).toBe(false);
    expect(isWidgetKeyIssuanceEnabled({ WIDGET_KEY_ISSUANCE_ENABLED: "false" })).toBe(false);
  });

  it("opens only with an explicit operator opt-in", () => {
    expect(isWidgetKeyIssuanceEnabled({ WIDGET_KEY_ISSUANCE_ENABLED: "true" })).toBe(true);
  });
});
