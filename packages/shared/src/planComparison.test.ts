import { describe, expect, it } from "vitest";

import { billingPlanCatalog, contentRetentionDaysByPlan } from "./billing";
import { planComparison } from "./planComparison";

const rowsOf = (locale: string) => planComparison(locale).flatMap((group) => group.rows);

describe("plan comparison", () => {
  it("takes allowances, rates and retention from the billing catalog", () => {
    const rows = rowsOf("en");
    const find = (feature: string) => rows.find((row) => row.feature === feature)!;
    expect(find("Voice minutes").pro).toEqual({ included: `${billingPlanCatalog.pro.voiceSecondsIncluded / 60} included`, then: "then $0.18/min" });
    expect(find("Transfer attempts").starter).toEqual({ included: `${billingPlanCatalog.starter.outboundCallAttemptsIncluded} included`, then: "then $0.02/attempt" });
    expect(find("Knowledge base").free).toBe("1 MB");
    expect(find("Call history and recordings")).toMatchObject({ free: `${contentRetentionDaysByPlan.free_cloud.recordings} days`, starter: `${contentRetentionDaysByPlan.starter.recordings} days` });
  });

  it("gives every language the same groups and rows", () => {
    const shape = (locale: string) => planComparison(locale).map((group) => group.rows.map((row) => [row.free, row.starter, row.pro, row.enterprise].map((value) => typeof value)));
    for (const locale of ["fr", "es", "sr"]) expect(shape(locale)).toEqual(shape("en"));
  });

  it("agrees French counts with their nouns", () => {
    const rows = rowsOf("fr");
    expect(rows.find((row) => row.feature === "Segments SMS d'alerte")!.pro).toEqual({ included: "200 inclus", then: "puis 0,02 $/segment" });
    expect(rows.find((row) => row.feature === "Tentatives de transfert")!.pro).toEqual({ included: "100 incluses", then: "puis 0,02 $/tentative" });
  });
});
