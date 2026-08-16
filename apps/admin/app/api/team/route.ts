import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businessInvitations, businessMemberships, users } from "@lobbystack/db";
import { inviteMember, removeMember, revokeInvitation, updateMemberRole } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

const roles = ["business_admin", "scheduler", "viewer"] as const;
type InviteRole = (typeof roles)[number];

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const [rows, invitations] = await Promise.all([
        tx.select({ membershipId: businessMemberships.id, userId: users.id, name: users.name, email: users.email, role: businessMemberships.role, status: businessMemberships.status }).from(businessMemberships).innerJoin(users, eq(users.id, businessMemberships.userId)).where(eq(businessMemberships.businessId, businessId)),
        tx.select({ invitationId: businessInvitations.id, email: businessInvitations.email, role: businessInvitations.role, status: businessInvitations.status, expiresAt: businessInvitations.expiresAt }).from(businessInvitations).where(eq(businessInvitations.businessId, businessId)),
      ]);
      return { members: rows, invitations };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    const body = await readJson(request) as { membershipId?: string; role?: string };
    if (!businessId || !body.membershipId || !body.role || !["business_admin", "scheduler", "viewer"].includes(body.role)) return NextResponse.json({ error: "businessId, membershipId, and a permitted role are required." }, { status: 400 });
    await updateMemberRole(createDomainContext(), { userId: session.user.id, businessId, membershipId: body.membershipId, role: body.role as "business_admin" | "scheduler" | "viewer" });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    const body = await readJson(request) as { membershipId?: string; invitationId?: string };
    if (!businessId || (!body.membershipId && !body.invitationId)) return NextResponse.json({ error: "businessId and a membershipId or invitationId are required." }, { status: 400 });
    if (body.membershipId) await removeMember(createDomainContext(), { userId: session.user.id, businessId, membershipId: body.membershipId });
    else await revokeInvitation(createDomainContext(), { userId: session.user.id, businessId, invitationId: body.invitationId! });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
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
