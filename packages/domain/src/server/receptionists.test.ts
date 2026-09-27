import { describe, expect, it } from "vitest";

import { defaultReceptionistName, receptionistPatchValues, receptionistsUsingItem } from "./receptionists";

describe("receptionistPatchValues", () => {
  it("trims text, clears empty optional instructions, and keeps only known fields", () => {
    expect(receptionistPatchValues({ name: "  Front   desk ", greeting: " Hello ", voiceInstructions: "   ", transferNumber: null, language: null })).toEqual({
      name: "Front desk",
      greeting: "Hello",
      voiceInstructions: null,
      transferNumber: null,
      language: null,
    });
  });

  it.each([
    [{ name: "" }, "receptionist_name_invalid"],
    [{ name: "x".repeat(81) }, "receptionist_name_invalid"],
    [{ greeting: "  " }, "receptionist_field_invalid"],
    [{ bookingMode: "sometimes" as never }, "receptionist_field_invalid"],
    [{ transferMode: "whenever" as never }, "receptionist_field_invalid"],
    [{ language: "de" as never }, "receptionist_field_invalid"],
    [{ voice: "Robot Voice!" }, "receptionist_field_invalid"],
  ])("rejects %j", (patch, code) => {
    expect(() => receptionistPatchValues(patch)).toThrow(expect.objectContaining({ status: 400, code }));
  });
});

describe("receptionistsUsingItem", () => {
  const usage = { receptionists: [{ id: "a", name: "Front desk" }, { id: "b", name: "After hours" }], knowledgeOptOuts: [], serviceOptOuts: [] };

  it("says every receptionist uses an item nobody opted out of", () => {
    expect(receptionistsUsingItem(usage, [])).toEqual({ all: true, names: ["Front desk", "After hours"] });
  });

  it("names the receptionists that still use it", () => {
    expect(receptionistsUsingItem(usage, ["b"])).toEqual({ all: false, names: ["Front desk"] });
  });
});

describe("defaultReceptionistName", () => {
  it("matches the backfill in the business's language", () => {
    expect(defaultReceptionistName("fr")).toBe("Réceptionniste");
    expect(defaultReceptionistName("en")).toBe("Receptionist");
    expect(defaultReceptionistName(undefined)).toBe("Receptionist");
  });
});
