import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { partnerTierCatalog } from "../packages/shared/src/billing";
import { docsLocales, partnerTiersSnippet, partnerTiersSnippetPath } from "./write-partner-tiers";

describe("pnpm docs:partner-tiers", () => {
  it.each(docsLocales)("keeps the %s tier table in the Help Center in step with partnerTierCatalog", (locale) => {
    expect(readFileSync(partnerTiersSnippetPath(locale), "utf8"), "Run pnpm docs:partner-tiers to write the tier tables again.").toBe(partnerTiersSnippet(locale));
  });

  it("prints a row per tier, with Free's trial number and a rate's fraction of a cent", () => {
    const rows = partnerTiersSnippet("en").split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| Tier") && !line.startsWith("| ---"));
    expect(rows.map((row) => row.split(" | ")[0])).toEqual(["| Free", "| Starter", "| Growth", "| Scale"]);
    expect(rows[0]).toContain(`${partnerTierCatalog.free.trialNumbers} trial number for 14 days | No overage | No overage |`);
    expect(rows[2]).toContain(`| \\$${partnerTierCatalog.growth.chatOverageRatePerChatCents / 100} |`);
  });

  it("uses one kind of no-break space whatever the ICU version, and a plural for more than one trial number", () => {
    for (const locale of docsLocales) expect(partnerTiersSnippet(locale)).not.toContain("\u202f");
    expect(partnerTiersSnippet("fr")).toMatch(/numéros? d'essai/);
  });
});
