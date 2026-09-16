import { NextResponse } from "next/server";

import { assignStaffToService, deleteService, unassignStaffFromService, updateService } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const body = await readJson(request) as { name?: string; slug?: string; durationMinutes?: number; description?: string | null; active?: boolean; staffId?: string; assigned?: boolean };
    const { serviceId } = await params;
    if (body.staffId && body.assigned !== undefined) {
      if (body.assigned) await assignStaffToService(createDomainContext(), { userId: session.user.id, businessId, serviceId, staffId: body.staffId });
      else await unassignStaffFromService(createDomainContext(), { userId: session.user.id, businessId, serviceId, staffId: body.staffId });
    } else {
      const { staffId: _staffId, assigned: _assigned, ...serviceUpdate } = body;
      await updateService(createDomainContext(), { userId: session.user.id, businessId, serviceId, ...serviceUpdate });
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const { serviceId } = await params;
    await deleteService(createDomainContext(), { userId: session.user.id, businessId, serviceId });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}
