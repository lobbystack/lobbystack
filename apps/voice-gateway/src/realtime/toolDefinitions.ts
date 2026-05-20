export function createWebRealtimeToolDefinitions() {
  return [
    {
      type: "function",
      name: "getBusinessHours",
      description: "Get the authoritative business hours and closure information.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "getBusinessServices",
      description:
        "List the structured services configured for this business, including duration and short descriptions when available.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "searchKnowledge",
      description:
        "Search indexed business knowledge and uploaded documents for a specific question.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "findAvailability",
      description:
        "Find candidate appointment slots for a service on a specific local date, optionally near a preferred hour.",
      parameters: {
        type: "object",
        properties: {
          serviceName: { type: "string" },
          date: {
            type: "string",
            description: "Local business date in YYYY-MM-DD format.",
          },
          timezone: { type: "string" },
          preferredStaffId: { type: "string" },
          preferredHour24: { type: "integer" },
          preferredMinute: { type: "integer" },
          limit: { type: "integer" },
        },
        required: ["serviceName", "date"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "checkAvailability",
      description:
        "Check appointment availability for a named service at an exact ISO datetime before promising a slot.",
      parameters: {
        type: "object",
        properties: {
          serviceName: { type: "string" },
          startsAt: { type: "string" },
          timezone: { type: "string" },
          preferredStaffId: { type: "string" },
        },
        required: ["serviceName", "startsAt"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "bookAppointment",
      description:
        "Book an appointment only after availability is confirmed. Collect the caller's phone number first and pass it as contactPhone.",
      parameters: {
        type: "object",
        properties: {
          serviceName: { type: "string" },
          startsAt: { type: "string" },
          timezone: { type: "string" },
          preferredStaffId: { type: "string" },
          contactName: { type: "string" },
          contactPhone: { type: "string" },
        },
        required: ["serviceName", "startsAt", "contactPhone"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "takeMessage",
      description:
        "Create a follow-up message for the operator after collecting the caller's message and callback details.",
      parameters: {
        type: "object",
        properties: {
          callerName: { type: "string" },
          callbackPhone: { type: "string" },
          message: { type: "string" },
          urgency: { type: "string" },
          callbackWindow: { type: "string" },
        },
        required: ["message"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "endCall",
      description:
        "End the web voice session after a clear closing cue, abuse, spam, or silence timeout.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            enum: ["caller_finished", "abuse", "silence_timeout", "spam"],
          },
          message: { type: "string" },
          severity: { type: "string", enum: ["borderline", "severe"] },
        },
        required: ["reason", "message"],
        additionalProperties: false,
      },
    },
  ];
}
