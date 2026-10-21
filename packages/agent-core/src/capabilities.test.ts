import { demoSnapshot, type AppointmentChangePolicy, type BookingMode, type BusinessContextSnapshot } from "@lobbystack/shared";
import { describe, expect, it } from "vitest";

import { receptionistCapabilities, toolUse, type Conversation } from "./capabilities";

const callerPhone = "+14165550100";
// A phone call's controls, as the worker gives them.
const callControl = { transfer: async () => true, hangup: async () => undefined, collectPasscode: async () => true };
const phoneCall: Conversation = { channel: "voice", callerPhone, callId: "call_1", callControl };

function capabilities(snapshot: Partial<BusinessContextSnapshot> = {}, conversation: Conversation = { channel: "web_chat" }) {
  return receptionistCapabilities({ ...demoSnapshot, ...snapshot }, conversation);
}

const changePolicy = (policy: Partial<AppointmentChangePolicy>) => ({ appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "phone_match_and_facts" as const, ...policy } });

// What GPT-Live hears the backend can change: "reschedule or cancel" becomes ["reschedule", "cancel"].
function liveChanges(live: string[]): string[] {
  return /^- Appointment changes: (.+?) an appointment /.exec(live.find((line) => line.startsWith("- Appointment changes:")) ?? "")?.[1]?.split(" or ") ?? [];
}

describe("receptionistCapabilities", () => {
  it("books directly and passes cancellations to the team by default", () => {
    expect(capabilities().tools).toEqual(["getBusinessHours", "getBusinessServices", "searchKnowledge", "takeMessage", "findAvailability", "bookAppointment", "requestAppointmentCancellation"]);
  });

  it("takes requests instead of booking in request mode", () => {
    const { tools } = capabilities({ bookingMode: "request" });
    expect(tools).toContain("requestAppointment");
    expect(tools).not.toContain("bookAppointment");
    expect(tools).not.toContain("findAvailability");
  });

  it("offers no booking actions when booking is off", () => {
    expect(capabilities({ bookingMode: "off" }, { channel: "voice", callerPhone }).tools).toEqual(["getBusinessHours", "getBusinessServices", "searchKnowledge", "takeMessage"]);
  });

  it("limits prospect demos to answering questions and taking messages", () => {
    expect(capabilities({}, { channel: "web_voice", intakeOnly: true, callControl }).tools).toEqual(["getBusinessHours", "getBusinessServices", "searchKnowledge", "takeMessage", "endCall"]);
  });

  it("transfers only phone calls, and only when the business takes transfers", () => {
    expect(capabilities({}, phoneCall).tools).toEqual(expect.arrayContaining(["transferCall", "endCall"]));
    const browser = capabilities({}, { channel: "web_voice", callControl: { hangup: callControl.hangup } }).tools;
    expect(browser).toContain("endCall");
    expect(browser).not.toContain("transferCall");
    expect(capabilities({ transferPolicy: { mode: "never", transferNumber: "+14165550199" } }, phoneCall).tools).not.toContain("transferCall");
    expect(capabilities({ transferPolicy: { mode: "always" } }, phoneCall).tools).not.toContain("transferCall");
  });

  it("records the caller's answer about texts only on a phone call the business can text back", () => {
    const tollFree = { contactChannels: { smsNumber: "+18445550100" } };
    expect(capabilities({}, phoneCall)).toMatchObject({ callerTextable: true, tools: expect.arrayContaining(["recordTextPreference"]) });
    for (const [snapshot, conversation] of [
      [{}, { channel: "web_chat" }],
      [{}, { channel: "web_voice", callId: "call_1" }],
      [tollFree, { ...phoneCall, callerPhone: "+381695021111" }],
      [{ contactChannels: {} }, phoneCall],
      [{}, { channel: "voice", callerPhone }],
      [{}, { ...phoneCall, intakeOnly: true }],
      [{ bookingMode: "off" }, phoneCall],
    ] as Array<[Partial<BusinessContextSnapshot>, Conversation]>) {
      expect(capabilities(snapshot, conversation).tools).not.toContain("recordTextPreference");
    }
  });

  describe("appointment changes", () => {
    it("lets a phone call from a trusted number cancel and reschedule, next to a request to the team", () => {
      const { tools, live } = capabilities({}, phoneCall);
      expect(tools).toEqual(expect.arrayContaining(["lookupAppointmentForChange", "verifyAppointmentForChange", "sendAppointmentChangeOtp", "verifyAppointmentChangeOtp", "cancelAppointment", "rescheduleAppointment", "requestAppointmentCancellation"]));
      expect(live).toContain("- Appointment changes: reschedule or cancel an appointment when the call comes from the phone number it was booked with. When it can't find or verify the appointment, as on a call from another number, the backend passes a cancellation request to the team, and the appointment stays booked until the team cancels it.");
    });

    it("promises GPT-Live only the change the business allows", () => {
      const cancelOnly = capabilities(changePolicy({ allowReschedule: false }), phoneCall);
      expect(cancelOnly.tools).toContain("cancelAppointment");
      expect(cancelOnly.tools).not.toContain("rescheduleAppointment");
      expect(liveChanges(cancelOnly.live)).toEqual(["cancel"]);

      const rescheduleOnly = capabilities(changePolicy({ allowCancel: false }), phoneCall);
      expect(rescheduleOnly.tools).toContain("rescheduleAppointment");
      expect(rescheduleOnly.tools).not.toContain("cancelAppointment");
      expect(rescheduleOnly.live).toContain("- Appointment changes: reschedule an appointment when the call comes from the phone number it was booked with. The backend passes a cancellation request to the team, and the appointment stays booked until the team cancels it.");
      expect(rescheduleOnly.guidance.join("\n")).toContain("You can't cancel appointments on this call.");

      // Rescheduling picks a new open time, which only instant booking finds.
      const requestMode = capabilities({ bookingMode: "request" }, phoneCall);
      expect(requestMode.tools).not.toContain("rescheduleAppointment");
      expect(liveChanges(requestMode.live)).toEqual(["cancel"]);
    });

    it("matches GPT-Live's promise to the tools for every change policy and booking mode", () => {
      for (const bookingMode of ["instant", "request", "off"] as BookingMode[]) {
        for (const allowCancel of [true, false]) {
          for (const allowReschedule of [true, false]) {
            for (const verificationMode of ["phone_match_and_facts", "otp_required", "passcode_required", "operator_only"] as const) {
              const { tools, live } = capabilities({ bookingMode, ...changePolicy({ allowCancel, allowReschedule, verificationMode }) }, phoneCall);
              const promised = liveChanges(live);
              expect(promised.includes("cancel")).toBe(tools.includes("cancelAppointment"));
              expect(promised.includes("reschedule")).toBe(tools.includes("rescheduleAppointment"));
              // Verifying is only worth it before a change the agent can make.
              expect(tools.includes("verifyAppointmentForChange")).toBe(promised.length > 0);
            }
          }
        }
      }
    });

    it("leaves every change to the team where the call has no trusted number or the business wants it", () => {
      const teamOnly = "- Appointment cancellations: the backend passes a cancellation request to the team. The appointment stays booked until the team cancels it.";
      const browserTeamOnly = "- Appointment cancellations: a browser call has no phone number to identify the caller, so the backend passes a cancellation request to the team. The appointment stays booked until the team cancels it.";
      for (const [{ tools, live }, line] of [
        [capabilities({}, { channel: "web_voice", callControl: { hangup: callControl.hangup } }), browserTeamOnly],
        [capabilities(changePolicy({ verificationMode: "operator_only" }), phoneCall), teamOnly],
        [capabilities(changePolicy({ allowCancel: false, allowReschedule: false }), phoneCall), teamOnly],
      ] as const) {
        expect(tools).toContain("requestAppointmentCancellation");
        expect(tools).not.toContain("lookupAppointmentForChange");
        expect(live).toContain(line);
      }
      // GPT-Live's instructions are set before the caller's number is known.
      const withheldNumber = capabilities({}, { channel: "voice", callControl });
      expect(withheldNumber.tools).not.toContain("cancelAppointment");
      expect(liveChanges(withheldNumber.live)).toEqual(["reschedule", "cancel"]);
    });
  });

  it("tells GPT-Live on a browser call only what the backend can do there", () => {
    const { live, livePersonRule } = capabilities({}, { channel: "web_voice" });
    expect(live.join("\n")).not.toContain("- Transfers:");
    expect(live).toContain("- Messages: take a message for the team, such as a request to be called back.");
    expect(liveChanges(live)).toEqual([]);
    expect(livePersonRule).toContain("so it can't be transferred");
    const phone = capabilities({}, { channel: "voice" });
    expect(phone.live).toContain("- Transfers: connect the caller to a person when the business allows it.");
    expect(phone.live).toContain("- Messages: take a message for the team.");
    expect(phone.livePersonRule).toBe("");
  });

  it("gives every tool it offers a kind and a progress line, and guidance only about those tools", () => {
    const conversations: Array<[Partial<BusinessContextSnapshot>, Conversation]> = [
      [{}, { channel: "web_chat" }],
      [{}, phoneCall],
      [{ bookingMode: "request" }, phoneCall],
      [{ bookingMode: "off" }, phoneCall],
      [{ hours: [] }, { channel: "web_voice", callControl: { hangup: callControl.hangup } }],
      [{}, { ...phoneCall, intakeOnly: true }],
      [changePolicy({ verificationMode: "passcode_required" }), phoneCall],
    ];
    const names = ["findAvailability", "bookAppointment", "requestAppointment", "requestAppointmentCancellation", "verifyAppointmentForChange", "verifyAppointmentChangeOtp", "requestKeypadPasscode", "cancelAppointment", "rescheduleAppointment", "recordTextPreference", "transferCall", "endCall"];
    for (const [snapshot, conversation] of conversations) {
      const { tools, guidance } = capabilities(snapshot, conversation);
      for (const name of tools) expect(toolUse(name).progress).not.toBe(`ran ${name}`);
      for (const name of names) {
        if (new RegExp(`\\b${name}\\b`).test(guidance.join("\n"))) expect(tools).toContain(name);
      }
    }
    expect(toolUse("bookAppointment").kind).toBe("action");
    expect(toolUse("recordTextPreference").kind).toBe("answer");
    expect(toolUse("findAvailability").kind).toBe("reusable_lookup");
    expect(toolUse("endCall").kind).toBe("other");
  });
});
