import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businessMemberships, users } from "@lobbystack/db";
import { inviteMember } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

const roles = ["business_admin", "scheduler", "viewer"] as const;
type InviteRole = (typeof roles)[number];

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const rows = await tx.select({ membershipId: businessMemberships.id, userId: users.id, name: users.name, email: users.email, role: businessMemberships.role, status: businessMemberships.status }).from(businessMemberships).innerJoin(users, eq(users.id, businessMemberships.userId)).where(eq(businessMemberships.businessId, businessId));
      return { members: rows };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("An invitation object is required.");
    const input = body as Record<string, unknown>;
    const businessId = typeof input.businessId === "string" ? input.businessId : businessIdFromRequest(request);
    if (!businessId) throw new Error("A businessId is required.");
    if (typeof input.email !== "string" || !input.email.trim()) throw new Error("email is required.");
    if (typeof input.role !== "string" || !roles.includes(input.role as InviteRole)) throw new Error("role is invalid.");
    return NextResponse.json(await inviteMember(createDomainContext(), { userId: session.user.id, businessId, email: input.email, role: input.role as InviteRole }), { status: 201 });
  } catch (error) {
    return asApiResponse(error);
  }
}
