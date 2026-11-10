import { describe, expect, it } from "vitest";

import { billingPlanCatalog } from "./billing";
import { planCards } from "./planCards";

describe("plan cards", () => {
  it("take prices and minutes from the billing catalog", () => {
    const [free, starter, pro] = planCards("en");
    expect(free!.lines[0]!.label).toBe(`${billingPlanCatalog.free_cloud.voiceSecondsIncluded / 60} voice minutes included`);
    expect(starter!.price).toEqual({ monthly: `$${billingPlanCatalog.starter.monthlyChargeCents / 100}`, annual: `$${billingPlanCatalog.starter.annualEffectiveMonthlyChargeCents / 100}` });
    expect(pro!.lines[0]).toEqual({ label: "500 voice minutes included", sublabel: "Then $0.18/min" });
  });

  it("show each plan's agent limit", () => {
    expect(billingPlanCatalog.free_cloud.includedAgents).toBe(1);
    expect(planCards("en").map((card) => card.lines.some((line) => line.label === (card.slug === "free_cloud" ? "1 agent" : "Unlimited agents")))).toEqual([true, true, true, true]);
    expect(planCards("fr")[2]!.lines.map((line) => line.label)).toContain("Agents illimités");
  });

  it("gives every language the same cards and lines", () => {
    const shape = (locale: string) => planCards(locale).map((card) => [card.slug, card.lines.length, card.featured]);
    for (const locale of ["fr", "es", "sr"]) expect(shape(locale)).toEqual(shape("en"));
    expect(planCards("fr")[1]!.lines[0]!.sublabel).toBe("Puis 0,20 $/min");
  });

  it("falls back to English for an unknown language", () => {
    expect(planCards("de")).toEqual(planCards("en"));
    expect(planCards("fr-CA")).toEqual(planCards("fr"));
  });
});
