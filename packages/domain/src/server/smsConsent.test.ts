import { afterEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@lobbystack/db";

import { classifySmsConsentUpdate, classifySmsKeywordReply, normalizeSmsKeyword, receiveSharedSenderSms, sharedSenderHelpReply, sharedSenderStartReply, smsBusinessList, smsHelpReply, smsStartReply } from "./sms";

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

describe("SMS HELP and START replies", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("name the host and the business on a business's own number", () => {
    expect(smsHelpReply({ businessName: "Axum Barbershop" })).toBe("LobbyStack sends appointment texts for Axum Barbershop. For help, contact hello@lobbystack.com or visit https://lobbystack.com. Reply STOP to opt out.");
    expect(smsStartReply({ appName: "Acme Desk", businessName: "Axum Barbershop" })).toBe("Acme Desk: You can get appointment texts from Axum Barbershop again. Msg frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.");
  });

  it("give the deployment's own address and website", () => {
    vi.stubEnv("NEXT_PUBLIC_LANDING_SITE_URL", "https://acme.example");
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "support@acme.example");
    expect(smsHelpReply({ appName: "Acme Desk", businessName: "Axum Barbershop" })).toBe("Acme Desk sends appointment texts for Axum Barbershop. For help, contact support@acme.example or visit https://acme.example. Reply STOP to opt out.");
    expect(sharedSenderHelpReply()).toBe("LobbyStack: For help with an appointment, call the business you booked with. For anything else, email support@acme.example. Reply STOP to opt out.");
  });

  it("name the businesses that text the shared sender's number", () => {
    expect(sharedSenderHelpReply({ businessNames: ["Axum Barbershop"] })).toBe("LobbyStack sends appointment texts for Axum Barbershop. For help with an appointment, call Axum Barbershop. For anything else, email hello@lobbystack.com. Reply STOP to opt out.");
    expect(sharedSenderHelpReply({ appName: "Acme Desk", businessNames: ["Axum Barbershop", "Bella Salon"] })).toBe("Acme Desk sends appointment texts for Axum Barbershop and Bella Salon. For help with an appointment, call the business you booked with. For anything else, email hello@lobbystack.com. Reply STOP to opt out.");
    expect(sharedSenderStartReply({ businessNames: ["Axum Barbershop"] })).toBe("LobbyStack: You can get appointment texts from Axum Barbershop again. Msg frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.");
  });

  it("name only the host when no business texts the number", () => {
    expect(sharedSenderHelpReply({ appName: "Acme Desk" })).toBe("Acme Desk: For help with an appointment, call the business you booked with. For anything else, email hello@lobbystack.com. Reply STOP to opt out.");
    expect(sharedSenderStartReply({ appName: "Acme Desk" })).toBe("Acme Desk: You can get texts from this number again. Reply HELP for help or STOP to opt out.");
  });

  it("list at most three businesses", () => {
    expect(smsBusinessList(["A", "B", "C"])).toBe("A, B, and C");
    expect(smsBusinessList(["A", "B", "C", "D"])).toBe("A, B, and 2 other businesses");
  });

  it("answer nothing but STOP, START and HELP on the shared sender, without reading the database", async () => {
    const db = {} as unknown as Database;
    expect(await receiveSharedSenderSms({ db }, { from: "+14165550123", body: "hello" })).toEqual({ reply: null, contactsChanged: 0 });
  });
});
