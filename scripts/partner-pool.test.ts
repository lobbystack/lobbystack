import { describe, expect, it } from "vitest";

import { describePartnerPool, parsePartnerPoolCommand } from "./partner-pool";

describe("pnpm partner-pool:set", () => {
  it("sets the minutes, the chats or both, and leaves out a kind the host didn't name", () => {
    expect(parsePartnerPoolCommand(["--partner", "acme", "--minutes", "500", "--chats", "2000"])).toEqual({ kind: "set", partner: "acme", voiceMinutes: 500, chats: 2_000 });
    expect(parsePartnerPoolCommand(["--partner", " acme.portal.example.test ", "--minutes", "0"])).toEqual({ kind: "set", partner: "acme.portal.example.test", voiceMinutes: 0 });
    expect(parsePartnerPoolCommand(["--partner", "acme", "--chats", "50"])).toEqual({ kind: "set", partner: "acme", chats: 50 });
    expect(parsePartnerPoolCommand(["--partner", "acme", "--clear"])).toEqual({ kind: "clear", partner: "acme" });
  });

  it("prints its usage when asked, or when the partner or the pool is missing", () => {
    expect(parsePartnerPoolCommand(["--help"])).toEqual({ kind: "usage", exitCode: 0 });
    expect(parsePartnerPoolCommand(["--minutes", "500"])).toEqual({ kind: "usage", exitCode: 1 });
    expect(parsePartnerPoolCommand(["--partner", "acme"])).toEqual({ kind: "usage", exitCode: 1 });
  });

  it("refuses an amount that isn't a whole number, and a clear that also sets a limit", () => {
    for (const value of ["-5", "1.5", "2,000", "lots", ""]) expect(() => parsePartnerPoolCommand(["--partner", "acme", `--minutes=${value}`])).toThrow("--minutes must be a whole number, such as 500.");
    expect(() => parsePartnerPoolCommand(["--partner", "acme", "--clear", "--chats", "50"])).toThrow(/--clear removes both limits/);
    expect(() => parsePartnerPoolCommand(["--partner", "acme", "--cap", "50"])).toThrow();
  });

  it("says what the partner's businesses share now", () => {
    const partner = { partnerId: "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11", name: "Acme Reception", slug: "acme" };
    expect(describePartnerPool({ ...partner, pool: { voiceSeconds: 30_000, chats: null } })).toEqual([
      "Acme Reception (acme, 5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11) shares this pool across its businesses each month:",
      "  Minutes: 500",
      "  Chats: no limit",
      "At the pool, their calls forward and their website chat stops replying until the month starts over.",
    ]);
    expect(describePartnerPool({ ...partner, pool: { voiceSeconds: null, chats: 2_000 } })).toContain("  Chats: 2,000");
    expect(describePartnerPool({ ...partner, pool: { voiceSeconds: null, chats: null } })).toEqual(["Acme Reception (acme, 5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11) has no pool limit now."]);
  });
});
