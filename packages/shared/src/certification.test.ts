import { expect, it } from "vitest";
import { assertCertificationBillingSandbox, assertCertificationCalendar, assertCertificationOperationAllowed, assertCertificationRecipient } from "./certification";

const enabled = { LOBBYSTACK_CERTIFICATION_MODE: "true", LOBBYSTACK_CERTIFICATION_EMAILS: "tester@example.invalid", LOBBYSTACK_CERTIFICATION_PHONES: "+14165550123", LOBBYSTACK_CERTIFICATION_CALENDARS: "dedicated-calendar" };

it("permits only explicitly allowlisted single recipients", () => {
  expect(() => assertCertificationRecipient("email", "TESTER@example.invalid", enabled)).not.toThrow();
  expect(() => assertCertificationRecipient("phone", "+14165550123", enabled)).not.toThrow();
  for (const address of ["other@example.invalid", "tester@example.invalid,other@example.invalid", "Tester <tester@example.invalid>", "tester@example.invalid\r\nBcc:other@example.invalid"]) expect(() => assertCertificationRecipient("email", address, enabled)).toThrow("CERTIFICATION_RECIPIENT_BLOCKED");
  expect(() => assertCertificationRecipient("phone", "+14165550124", enabled)).toThrow();
  expect(() => assertCertificationRecipient("phone", "+14165550123", { LOBBYSTACK_CERTIFICATION_MODE: "true" })).toThrow();
});

it("blocks phone inventory mutations, primary calendars, and live billing", () => {
  expect(() => assertCertificationOperationAllowed(enabled)).toThrow("CERTIFICATION_OPERATION_BLOCKED");
  expect(() => assertCertificationCalendar("dedicated-calendar", enabled)).not.toThrow();
  expect(() => assertCertificationCalendar("primary", { ...enabled, LOBBYSTACK_CERTIFICATION_CALENDARS: "primary" })).toThrow();
  expect(() => assertCertificationBillingSandbox("https://sandbox-api.polar.sh", enabled)).not.toThrow();
  expect(() => assertCertificationBillingSandbox("https://api.polar.sh", enabled)).toThrow();
  expect(() => assertCertificationBillingSandbox("https://sandbox-api.polar.sh.evil.invalid", enabled)).toThrow();
});

it("leaves normal operation unchanged but refuses a mistyped safety flag", () => {
  expect(() => assertCertificationRecipient("phone", "+14165550999", {})).not.toThrow();
  expect(() => assertCertificationOperationAllowed({ LOBBYSTACK_CERTIFICATION_MODE: "false" })).not.toThrow();
  expect(() => assertCertificationRecipient("email", "tester@example.invalid", { LOBBYSTACK_CERTIFICATION_MODE: "tru" })).toThrow("INVALID_CERTIFICATION_MODE");
});
