import { describe, expect, it } from "vitest";

import { apiAppointmentCreateSchema, apiAppointmentRescheduleSchema, apiContactCreateSchema, apiKnowledgeEntryCreateSchema, parseApiInput } from "./schemas";

// API and MCP clients get these details back as error.details, so a zod upgrade must not reword them.
describe("parseApiInput", () => {
  it("reports field problems with stable paths and messages", () => {
    expect(parseApiInput(apiContactCreateSchema, { name: "", phone: "123", email: "nope", locale: "de", timezone: 5, extra: 1 })).toEqual({
      ok: false,
      details: [
        { path: "name", message: "Too small: expected string to have >=1 characters" },
        { path: "phone", message: "Use E.164 format, for example +14165550134." },
        { path: "email", message: "Invalid email address" },
        { path: "locale", message: "Invalid option: expected one of \"en\"|\"fr\"|\"es\"|\"sr\"" },
        { path: "timezone", message: "Invalid input: expected string, received number" },
        { path: "(body)", message: "Unrecognized key: \"extra\"" },
      ],
    });
    expect(parseApiInput(apiAppointmentCreateSchema, { service_id: "11111111-1111-1111-1111-111111111111", starts_at: "2026-01-01 10:00", contact_id: "3f0f6f2e-7c1a-4b8e-9a5d-2c3b4a5d6e7f" })).toEqual({
      ok: false,
      details: [
        { path: "service_id", message: "Invalid UUID" },
        { path: "starts_at", message: "Invalid ISO datetime" },
      ],
    });
    expect(parseApiInput(apiContactCreateSchema, null)).toEqual({ ok: false, details: [{ path: "(body)", message: "Invalid input: expected object, received null" }] });
  });

  it("keeps the custom refinement messages", () => {
    expect(parseApiInput(apiContactCreateSchema, {})).toEqual({ ok: false, details: [{ path: "phone", message: "Provide a phone or an email." }] });
    expect(parseApiInput(apiAppointmentCreateSchema, { service_id: "3f0f6f2e-7c1a-4b8e-9a5d-2c3b4a5d6e7f", starts_at: "2026-01-01T10:00:00-04:00" })).toEqual({
      ok: false,
      details: [{ path: "contact_phone", message: "Provide contact_id or contact_phone." }],
    });
  });

  it("says Invalid input for an unknown knowledge entry type", () => {
    expect(parseApiInput(apiKnowledgeEntryCreateSchema, { type: "video" })).toEqual({ ok: false, details: [{ path: "type", message: "Invalid input" }] });
  });

  it("accepts start times with or without seconds", () => {
    for (const starts_at of ["2026-10-09T14:00-04:00", "2026-10-09T18:00Z", "2026-10-09T14:00:00-04:00", "2026-10-09T18:00:00.000Z"]) {
      expect(parseApiInput(apiAppointmentRescheduleSchema, { starts_at })).toEqual({ ok: true, data: { starts_at } });
    }
    expect(parseApiInput(apiAppointmentRescheduleSchema, { starts_at: "2026-10-09T14:00" })).toEqual({ ok: false, details: [{ path: "starts_at", message: "Invalid ISO datetime" }] });
  });
});
