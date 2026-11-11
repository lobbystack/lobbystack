import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Reads a time off from a request body: `staffId` (null for the whole business), local `startsAt` and `endsAt`, `name` and an optional `note`. */
export function readTimeOff(body: Record<string, unknown>) {
  const staffId = body.staffId === null || body.staffId === undefined || body.staffId === "" ? null : body.staffId;
  if (staffId !== null && (typeof staffId !== "string" || !isUuid(staffId))) throw jsonError("staffId must be a UUID or null.", 400, "invalid_request");
  if (typeof body.startsAt !== "string" || typeof body.endsAt !== "string" || !LOCAL_DATE_TIME.test(body.startsAt) || !LOCAL_DATE_TIME.test(body.endsAt)) throw jsonError("startsAt and endsAt must be local times like 2026-12-25T09:00.", 400, "invalid_request");
  if (typeof body.name !== "string") throw jsonError("name is required.", 400, "invalid_request");
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") throw jsonError("note must be text.", 400, "invalid_request");
  return { staffId, startsAt: body.startsAt, endsAt: body.endsAt, name: body.name, note: (body.note as string | null | undefined) ?? null };
}

/** The time off as the calendar reads it. */
export function serializeTimeOff(entry: { id: string; staffId: string | null; staffName: string | null; startsAt: Date; endsAt: Date; name: string; note: string | null }) {
  return { ...entry, startsAt: entry.startsAt.toISOString(), endsAt: entry.endsAt.toISOString() };
}
