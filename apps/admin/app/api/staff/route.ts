import { NextResponse } from "next/server";
import { z } from "zod";

import { createStaffMember, listStaff, setStaffEnabled, updateStaffMember } from "@lobbystack/domain";
import { asApiResponse, jsonError, readJson, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

const createSchema = z.object({ name: z.string().trim().min(1).max(120) });
const updateSchema = z.union([
  z.object({ enabled: z.boolean() }),
  z.object({ staffId: z.string().uuid(), name: z.string().trim().min(1).max(120).optional(), active: z.boolean().optional() }),
]);

function invalid(error: unknown) {
  return error instanceof z.ZodError ? jsonError("Invalid request.", 400, "invalid_request") : asApiResponse(error);
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ session, businessId }) => ({ staff: await listStaff(createDomainContext(), { userId: session.user.id, businessId }) })));
  } catch (error) { return invalid(error); }
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await readJson(request));
    return NextResponse.json(await withOperatorTransaction(request, async ({ session, businessId }) => ({ staffId: await createStaffMember(createDomainContext(), { userId: session.user.id, businessId, name: body.name }) }), { minimumRole: "business_admin" }), { status: 201 });
  } catch (error) { return invalid(error); }
}

/** `{ enabled }` turns staff management on or off; `{ staffId, ... }` edits one member. */
export async function PATCH(request: Request) {
  try {
    const body = updateSchema.parse(await readJson(request));
    await withOperatorTransaction(request, async ({ session, businessId }) => {
      const input = { userId: session.user.id, businessId };
      if ("enabled" in body) await setStaffEnabled(createDomainContext(), { ...input, enabled: body.enabled });
      else await updateStaffMember(createDomainContext(), { ...input, staffId: body.staffId, ...(body.name !== undefined ? { name: body.name } : {}), ...(body.active !== undefined ? { active: body.active } : {}) });
    }, { minimumRole: "business_admin" });
    return NextResponse.json({ ok: true });
  } catch (error) { return invalid(error); }
}
