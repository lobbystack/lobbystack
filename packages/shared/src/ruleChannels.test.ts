import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runtimeLocales } from "./locales";
import { apiRuleReorderSchema } from "./publicApi/schemas";
import { RULES_MAX, RULES_REORDER_MAX } from "./agentSettings";
import { channelRuleTitle, channelRuleTitles, ruleChannelOf, ruleChannels } from "./ruleChannels";

const migration = readFileSync(fileURLToPath(new URL("../../db/migrations/0203_rule_channels.sql", import.meta.url)), "utf8");

describe("channelRuleTitle", () => {
  it("names each channel in every caller language", () => {
    for (const locale of runtimeLocales) for (const channel of ruleChannels) expect(channelRuleTitle(channel, locale).trim()).not.toBe("");
    expect(channelRuleTitle("voice", "en")).toBe("On calls");
    expect(channelRuleTitle("sms", "en")).toBe("In texts");
    expect(channelRuleTitle("web_chat", "en")).toBe("In website chat");
    expect(channelRuleTitle("instagram", "en")).toBe("On Instagram");
  });

  it("titles rules as migration 0203 does", () => {
    for (const [locale, titles] of Object.entries(channelRuleTitles())) {
      const row = `('${locale}', ${ruleChannels.map((channel) => `'${titles[channel].replaceAll("'", "''")}'`).join(", ")})`;
      expect(migration).toContain(row);
    }
  });
});

describe("RULES_REORDER_MAX", () => {
  it("leaves room for the one rule per channel migration 0203 could add past RULES_MAX", () => {
    expect(RULES_REORDER_MAX).toBe(RULES_MAX + ruleChannels.length);
    const ids = (count: number) => Array.from({ length: count }, () => randomUUID());
    expect(apiRuleReorderSchema.safeParse({ rule_ids: ids(RULES_REORDER_MAX) }).success).toBe(true);
    expect(apiRuleReorderSchema.safeParse({ rule_ids: ids(RULES_REORDER_MAX + 1) }).success).toBe(false);
  });
});

describe("ruleChannelOf", () => {
  it("keeps browser calls with phone calls, and every other channel as itself", () => {
    expect(ruleChannelOf("voice")).toBe("voice");
    expect(ruleChannelOf("web_voice")).toBe("voice");
    expect(ruleChannelOf("sms")).toBe("sms");
    expect(ruleChannelOf("web_chat")).toBe("web_chat");
    expect(ruleChannelOf("instagram")).toBe("instagram");
    expect(ruleChannelOf("email")).toBeNull();
    expect(ruleChannelOf(undefined)).toBeNull();
  });
});
