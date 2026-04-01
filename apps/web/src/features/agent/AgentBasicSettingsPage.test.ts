import { describe, expect, it } from "vitest";

import { resolveTransferNumberForSave } from "@/features/agent/AgentBasicSettingsPage";

describe("resolveTransferNumberForSave", () => {
  it("preserves the persisted transfer number when the current input is partial", () => {
    expect(
      resolveTransferNumberForSave({
        persistedTransferNumber: "+18557477712",
        rawInputValue: "(855) 747-77",
        validTransferNumber: "",
      }),
    ).toBe("+18557477712");
  });

  it("clears the transfer number when the visible input is empty", () => {
    expect(
      resolveTransferNumberForSave({
        persistedTransferNumber: "+18557477712",
        rawInputValue: "",
        validTransferNumber: "",
      }),
    ).toBeNull();
  });

  it("saves the normalized transfer number when the current input is valid", () => {
    expect(
      resolveTransferNumberForSave({
        persistedTransferNumber: "+18557477712",
        rawInputValue: "(514) 555-0123",
        validTransferNumber: "+15145550123",
      }),
    ).toBe("+15145550123");
  });
});
