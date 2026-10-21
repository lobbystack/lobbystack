import { afterEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@lobbystack/db";

import { classifySmsConsentUpdate, classifySmsKeywordReply, normalizeSmsKeyword, receiveSharedSenderSms, sharedSenderHelpReply } from "./sms";

describe("SMS consent classifiers", () => {
  it("normalizes keywords to alphanumeric uppercase", () => {
    expect(normalizeSmsKeyword("  stop! ")).toBe("STOP");
    expect(normalizeSmsKeyword("unsubscribe")).toBe("UNSUBSCRIBE");
  });

  it("classifies Twilio opt-out types with source precedence", () => {
    expect(classifySmsConsentUpdate({ body: "irrelevant", optOutType: "STOP" })).toEqual({ status: "opted_out", source: "twilio_opt_out:STOP" });
    expect(classifySmsConsentUpdate({ body: "irrelevant", optOutType: "START" })).toEqual({ status: "subscribed", source: "twilio_opt_out:START" });
  });

  it("classifies STOP and START keyword bodies", () => {
    expect(classifySmsConsentUpdate({ body: "stop" })).toEqual({ status: "opted_out", source: "keyword:STOP" });
    expect(classifySmsConsentUpdate({ body: "start" })).toEqual({ status: "subscribed", source: "keyword:START" });
    expect(classifySmsConsentUpdate({ body: "Yes please" })).toBeNull();
  });

  it("returns compliance replies only for HELP and START", () => {
    expect(classifySmsKeywordReply({ body: "help" })?.kind).toBe("help");
    expect(classifySmsKeywordReply({ body: "start" })?.kind).toBe("start");
    expect(classifySmsKeywordReply({ body: "stop" })).toBeNull();
    expect(classifySmsKeywordReply({ body: "hello" })).toBeNull();
  });
});

describe("SMS HELP replies", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keep LobbyStack's registered wording when the deployment sets no links", () => {
    expect(classifySmsKeywordReply({ body: "help" })?.body).toBe("LobbyStack: For help, contact hello@lobbystack.com or visit https://lobbystack.com. Reply STOP to opt out.");
    expect(sharedSenderHelpReply()).toBe("LobbyStack: For help with an appointment, call the business you booked with. For anything else, email hello@lobbystack.com. Reply STOP to opt out.");
  });

  it("give the deployment's own address and website", () => {
    vi.stubEnv("NEXT_PUBLIC_LANDING_SITE_URL", "https://acme.example");
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "support@acme.example");
    expect(classifySmsKeywordReply({ body: "HELP" })?.body).toBe("LobbyStack: For help, contact support@acme.example or visit https://acme.example. Reply STOP to opt out.");
    expect(sharedSenderHelpReply()).toBe("LobbyStack: For help with an appointment, call the business you booked with. For anything else, email support@acme.example. Reply STOP to opt out.");
  });

  it("name the deployment on the shared sender too", async () => {
    vi.stubEnv("BRAND_APP_NAME", "");
    const db = { select: () => ({ from: () => ({ limit: async () => [{ appName: "Acme Desk", logoVersion: null }] }) }) } as unknown as Database;
    expect(await receiveSharedSenderSms({ db }, { from: "+14165550123", body: "help" })).toEqual({
      reply: "Acme Desk: For help with an appointment, call the business you booked with. For anything else, email hello@lobbystack.com. Reply STOP to opt out.",
      contactsChanged: 0,
    });
  });
});
