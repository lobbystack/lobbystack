import { describe, expect, it } from "vitest";

import { resolveTransferNumberForSave } from "@/features/agent/AgentBasicSettingsPage";

describe("resolveTransferNumberForSave", () => {
  it("rejects partial visible input instead of silently keeping the old value", () => {
    expect(
      resolveTransferNumberForSave({
        rawInputValue: "(855) 747-77",
        validTransferNumber: "",
      }),
    ).toEqual({
      ok: false,
      errorKey: "agent:fields.transferNumber.errors.invalid",
    });
  });

  it("clears the transfer number when the visible input is empty", () => {
    expect(
      resolveTransferNumberForSave({
        rawInputValue: "",
        validTransferNumber: "",
      }),
    ).toEqual({
      ok: true,
      value: null,
    });
  });

  it("saves the normalized transfer number when the current input is valid", () => {
    expect(
      resolveTransferNumberForSave({
        rawInputValue: "(514) 555-0123",
        validTransferNumber: "+15145550123",
      }),
    ).toEqual({
      ok: true,
      value: "+15145550123",
    });
  });
});
