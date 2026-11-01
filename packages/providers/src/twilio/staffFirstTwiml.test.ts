import { describe, expect, it } from "vitest";

import { dialReceptionistTwiml, emptyTwiml, hangupTwiml, receptionistDialOutcome, referTargetPhone, ringStaffTwiml, staffDialOutcome, staffPressTwiml, staffPromptTwiml } from "./staffFirstTwiml";

const sip = "sip:proj_1@sip.api.openai.com;transport=tls;secure=true";

describe("ringStaffTwiml", () => {
  const ring = { staffPhone: "+14165550142", ringSeconds: 15, locale: "en" as const, actionUrl: "https://app.test/action?business=b&called=%2B1", promptUrl: "https://app.test/prompt" };

  it("takes Twilio's five-second buffer off the ring time", () => {
    expect(ringStaffTwiml(ring)).toContain('timeout="10"');
    expect(ringStaffTwiml({ ...ring, ringSeconds: 60 })).toContain('timeout="55"');
  });

  it("keeps the shortest ring at Twilio's minimum", () => {
    expect(ringStaffTwiml({ ...ring, ringSeconds: 10 })).toContain('timeout="5"');
  });

  it("keeps the caller ringing and sends the staff leg to the prompt", () => {
    const xml = ringStaffTwiml(ring);
    expect(xml).toContain('answerOnBridge="true"');
    expect(xml).toContain('<Number url="https://app.test/prompt" method="POST">+14165550142</Number>');
    expect(xml).toContain("business=b&amp;called=%2B1");
  });

  it("reads the message first, in the business's language", () => {
    const xml = ringStaffTwiml({ ...ring, message: "Un instant & merci.", locale: "fr" });
    expect(xml.indexOf("<Say")).toBeLessThan(xml.indexOf("<Dial"));
    expect(xml).toContain('language="fr-CA"');
    expect(xml).toContain("Un instant &amp; merci.");
  });

  it("drops the message on a Serbian business, which Twilio has no voice for", () => {
    expect(ringStaffTwiml({ ...ring, message: "Sačekajte.", locale: "sr" })).not.toContain("<Say");
  });
});

describe("dialReceptionistTwiml", () => {
  const dial = { sipAddress: sip, called: "+14165550123", locale: "en" as const, actionUrl: "https://app.test/result", referUrl: "https://app.test/refer" };

  it("sends the dialled number as a URI header over TLS and SRTP", () => {
    expect(dialReceptionistTwiml(dial)).toContain(`<Sip>${sip}?X-LobbyStack-Called=tel:+14165550123</Sip>`);
  });

  it("never uses the secure attribute, which gets the call refused", () => {
    expect(dialReceptionistTwiml(dial)).not.toMatch(/<Sip [^>]*secure/);
  });

  it("names a referUrl and keeps the caller ringing", () => {
    const xml = dialReceptionistTwiml(dial);
    expect(xml).toContain('referUrl="https://app.test/refer"');
    expect(xml).toContain('answerOnBridge="true"');
  });

  it("reads the handover message first", () => {
    const xml = dialReceptionistTwiml({ ...dial, message: "Connecting you now." });
    expect(xml.indexOf("Connecting you now.")).toBeLessThan(xml.indexOf("<Dial"));
  });
});

describe("the staff prompt", () => {
  const prompt = { business: "Harbor Dental", locale: "en" as const, pressUrl: "https://app.test/press" };

  it("names the caller when the business knows them", () => {
    expect(staffPromptTwiml({ ...prompt, caller: { name: "Ada Lovelace", phone: "+14165550134" } })).toContain("Call for Harbor Dental from Ada Lovelace. Press 1 to answer.");
  });

  it("reads an unknown caller's number digit by digit", () => {
    expect(staffPromptTwiml({ ...prompt, caller: { phone: "+1416" } })).toContain("from 1, 4, 1, 6.");
  });

  it("says when the caller withheld their number", () => {
    expect(staffPromptTwiml({ ...prompt, caller: {} })).toContain("from a private number");
  });

  it("hangs up the staff leg unless someone presses, so a voicemail never keeps the call", () => {
    const xml = staffPromptTwiml({ ...prompt, caller: {} });
    expect(xml.indexOf("</Gather>")).toBeLessThan(xml.indexOf("<Hangup/>"));
  });

  it("speaks English to a Serbian business's staff", () => {
    expect(staffPromptTwiml({ ...prompt, locale: "sr", caller: {} })).toContain('language="en-US"');
  });

  it("bridges only on a press of 1", () => {
    expect(staffPressTwiml("1")).toBe(emptyTwiml());
    expect(staffPressTwiml("2")).toBe(hangupTwiml());
    expect(staffPressTwiml(undefined)).toBe(hangupTwiml());
  });
});

describe("staffDialOutcome", () => {
  it.each([
    [{ DialCallStatus: "completed", DialBridged: "true" }, "accepted"],
    // A voicemail answered and nobody pressed 1.
    [{ DialCallStatus: "completed", DialBridged: "false" }, "handover"],
    [{ DialCallStatus: "no-answer", DialBridged: "false" }, "handover"],
    [{ DialCallStatus: "busy", DialBridged: "false" }, "handover"],
    [{ DialCallStatus: "failed", DialBridged: "false" }, "handover"],
    [{ DialCallStatus: "canceled", DialBridged: "false", CallStatus: "canceled" }, "caller_gone"],
    [{ DialCallStatus: "no-answer", DialBridged: "false", CallStatus: "completed" }, "caller_gone"],
    // The caller hung up on a staff member who had accepted.
    [{ DialCallStatus: "completed", DialBridged: "true", CallStatus: "completed" }, "accepted"],
  ])("reads %j as %s", (params, outcome) => {
    expect(staffDialOutcome(params)).toBe(outcome);
  });
});

describe("receptionistDialOutcome", () => {
  it.each([
    [{ DialCallStatus: "completed", DialBridged: "true" }, "finished"],
    [{ DialCallStatus: "failed", DialBridged: "false", CallStatus: "completed" }, "finished"],
    [{ DialCallStatus: "failed", DialBridged: "false", DialSipResponseCode: "503" }, "refused"],
    [{ DialCallStatus: "busy", DialBridged: "false", DialSipResponseCode: "486" }, "refused"],
    [{ DialCallStatus: "failed", DialBridged: "false", DialSipResponseCode: "603" }, "blocked"],
    // Twilio sent no code on the spike's refused calls.
    [{ DialCallStatus: "failed", DialBridged: "false" }, "refused"],
    [{ DialCallStatus: "no-answer", DialBridged: "false" }, "refused"],
  ])("reads %j as %s", (params, outcome) => {
    expect(receptionistDialOutcome(params)).toBe(outcome);
  });
});

describe("referTargetPhone", () => {
  it.each([
    ["+14165550100", "+14165550100"],
    ["tel:+14165550100", "+14165550100"],
    ["<sip:+14165550100@sip.api.openai.com>", "+14165550100"],
    ["sip:14165550100@host;transport=tls", "+14165550100"],
  ])("finds the phone in %s", (target, phone) => {
    expect(referTargetPhone(target)).toBe(phone);
  });

  it.each([[undefined], [""], ["sip:reception@example.com"]])("finds none in %s", (target) => {
    expect(referTargetPhone(target)).toBeUndefined();
  });
});
