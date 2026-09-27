import { NextResponse } from "next/server";
import { z } from "zod";

import { createReceptionist, getSharedItemUsage, listReceptionistRoutes, listReceptionists, routePhoneNumber, routeWidgetKey } from "@lobbystack/domain";
import { asApiResponse, jsonError, readJson, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

const createSchema = z.object({ name: z.string().trim().min(1).max(80), copyFromAgentId: z.string().uuid().optional() });
const routeSchema = z.object({ kind: z.enum(["phone_number", "widget_key"]), id: z.string().uuid(), agentId: z.string().uuid() });

function invalid(error: unknown) {
  return error instanceof z.ZodError ? jsonError("Invalid request.", 400, "invalid_request") : asApiResponse(error);
}

/** Adds a receptionist, starting as a copy of another one. */
export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await readJson(request));
    return NextResponse.json(await withOperatorTransaction(request, async ({ session, businessId }) => ({
      receptionist: await createReceptionist(createDomainContext(), { userId: session.user.id, businessId, name: body.name, ...(body.copyFromAgentId ? { copyFromAgentId: body.copyFromAgentId } : {}) }),
    }), { minimumRole: "business_admin" }), { status: 201 });
  } catch (error) { return invalid(error); }
}

/** Chooses which receptionist answers a phone number or the website widget. */
export async function PUT(request: Request) {
  try {
    const body = routeSchema.parse(await readJson(request));
    await withOperatorTransaction(request, async ({ session, businessId }) => {
      const input = { userId: session.user.id, businessId, agentId: body.agentId };
      if (body.kind === "phone_number") await routePhoneNumber(createDomainContext(), { ...input, phoneNumberId: body.id });
      else await routeWidgetKey(createDomainContext(), { ...input, widgetKeyId: body.id });
    }, { minimumRole: "business_admin" });
    return NextResponse.json({ ok: true });
  } catch (error) { return invalid(error); }
}

/**
 * The business's receptionists with the numbers and widget keys that route to
 * each, and who uses which shared knowledge item and service.
 */
export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ session, businessId }) => {
      const context = createDomainContext();
      const input = { userId: session.user.id, businessId };
      const [receptionists, routes, usage] = await Promise.all([
        listReceptionists(context, input),
        listReceptionistRoutes(context, input),
        getSharedItemUsage(context, input),
      ]);
      return { receptionists, routes, usage };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
