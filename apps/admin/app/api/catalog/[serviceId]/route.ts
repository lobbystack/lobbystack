import { NextResponse } from "next/server";

import { assignStaffToService, deleteService, unassignStaffFromService, updateService } from "@lobbystack/domain";
import { asApiResponse, readJson, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const body = await readJson(request) as { name?: string; slug?: string; durationMinutes?: number; description?: string | null; active?: boolean; staffId?: string; assigned?: boolean };
    const { serviceId } = await params;
    if (body.staffId && body.assigned !== undefined) {
      if (body.assigned) await assignStaffToService(createDomainContext(), { userId: session.user.id, businessId, serviceId, staffId: body.staffId });
      else await unassignStaffFromService(createDomainContext(), { userId: session.user.id, businessId, serviceId, staffId: body.staffId });
    } else {
      const { staffId: _staffId, assigned: _assigned, ...serviceUpdate } = body;
      await updateService(createDomainContext(), { ...serviceUpdate, userId: session.user.id, businessId, serviceId });
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { serviceId } = await params;
    await deleteService(createDomainContext(), { userId: session.user.id, businessId, serviceId });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}
