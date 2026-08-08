import { NextRequest } from "next/server";

import {
  bookAppointmentToolRequestSchema,
  checkAvailabilityToolRequestSchema,
  findAvailabilityToolRequestSchema,
  lookupAppointmentForChangeToolRequestSchema,
  searchKnowledgeToolRequestSchema,
  takeMessageToolRequestSchema,
} from "@lobbystack/contracts";
import {
  bookVoiceAppointment,
  checkVoiceAvailability,
  findVoiceAvailability,
  lookupVoiceAppointments,
  searchVoiceKnowledge,
  takeVoiceMessage,
} from "@lobbystack/domain/server";

import { errorResponse, jsonResponse } from "@/lib/api-helpers";
import { readRequestBody, verifyInternalRequest } from "@/lib/internal-auth";

export const runtime = "nodejs";

const toolHandlers: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
  "find-availability": async (body) =>
    findVoiceAvailability(findAvailabilityToolRequestSchema.parse(body)),
  "check-availability": async (body) =>
    checkVoiceAvailability(checkAvailabilityToolRequestSchema.parse(body)),
  "book-appointment": async (body) =>
    bookVoiceAppointment(bookAppointmentToolRequestSchema.parse(body)),
  "lookup-appointment": async (body) =>
    lookupVoiceAppointments(lookupAppointmentForChangeToolRequestSchema.parse(body)),
  "take-message": async (body) => takeVoiceMessage(takeMessageToolRequestSchema.parse(body)),
  "search-knowledge": async (body) =>
    searchVoiceKnowledge({
      ...searchKnowledgeToolRequestSchema.parse(body),
      embedding: [],
    }),
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tool: string }> },
) {
  try {
    const { tool } = await context.params;
    const bodyText = await readRequestBody(request);
    const auth = verifyInternalRequest({
      method: request.method,
      path: request.nextUrl.pathname,
      body: bodyText,
      headers: request.headers,
    });
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, { status: auth.status });
    }

    const handler = toolHandlers[tool];
    if (!handler) {
      return jsonResponse({ error: "Unknown tool" }, { status: 404 });
    }

    const body = JSON.parse(bodyText) as Record<string, unknown>;
    const result = await handler(body);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
