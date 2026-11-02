import { describe, expect, it } from "vitest";

import { canTextNumber, permanentSmsErrorCode, smsRecipientRegion } from "./smsReach";

describe("canTextNumber", () => {
  it("lets toll-free numbers text only US, Canadian and Puerto Rican numbers", () => {
    expect(canTextNumber("+18445550100", "+14165550134")).toBe(true);
    expect(canTextNumber("+18445550100", "+17875550134")).toBe(true);
    expect(canTextNumber("+18445550100", "+18765550134")).toBe(false);
    expect(canTextNumber("+18445550100", "+381695021111")).toBe(false);
    expect(canTextNumber("+18005550100", "+447700900123")).toBe(false);
  });

  it("leaves local numbers to the provider", () => {
    expect(canTextNumber("+14165550100", "+381695021111")).toBe(true);
  });

  it("can't text without a sender or a recipient", () => {
    expect(canTextNumber(undefined, "+14165550134")).toBe(false);
    expect(canTextNumber("+14165550100", null)).toBe(false);
  });
});

describe("permanentSmsErrorCode", () => {
  it("recognizes Twilio errors a retry can't fix", () => {
    expect(permanentSmsErrorCode(Object.assign(new Error("Permission to send an SMS has not been enabled"), { code: 21408, status: 400 }))).toBe(21408);
    expect(permanentSmsErrorCode({ code: 21211 })).toBe(21211);
  });

  it("leaves other failures to the retry", () => {
    expect(permanentSmsErrorCode(Object.assign(new Error("Too many requests"), { code: 20429, status: 429 }))).toBeUndefined();
    expect(permanentSmsErrorCode(new Error("socket hang up"))).toBeUndefined();
    expect(permanentSmsErrorCode(undefined)).toBeUndefined();
  });
});

describe("smsRecipientRegion", () => {
  it("places Canadian area codes in Canada", () => {
    expect(smsRecipientRegion("+14165550134")).toBe("canada");
    expect(smsRecipientRegion("+15145550134")).toBe("canada");
    expect(smsRecipientRegion("+18795550134")).toBe("canada");
  });

  it("counts the US, Puerto Rico and the US territories as US", () => {
    for (const phone of ["+12125550134", "+17875550134", "+19395550134", "+13405550134", "+16715550134", "+16705550134", "+16845550134"]) expect(smsRecipientRegion(phone)).toBe("us");
  });

  it("counts a +1 number it can't place as US, the stricter side", () => {
    expect(smsRecipientRegion("+18005550134")).toBe("us");
  });

  it("leaves Caribbean countries on +1 and other countries out of it", () => {
    expect(smsRecipientRegion("+18765550134")).toBe("other");
    expect(smsRecipientRegion("+447700900123")).toBe("other");
  });
});
