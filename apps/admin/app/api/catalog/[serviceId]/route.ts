import { NextResponse } from "next/server";

import { assignStaffToService, deleteService, unassignStaffFromService, updateService } from "@lobbystack/domain";
import type { ServicePriceType } from "@lobbystack/shared";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const PATCH = operatorRoute<{ serviceId: string }>(async ({ userId, businessId, body: input, domain }, { serviceId }) => {
  const body = input as { name?: string; slug?: string; durationMinutes?: number; description?: string | null; active?: boolean; priceType?: ServicePriceType; priceMinor?: number | null; priceMaxMinor?: number | null; staffId?: string; assigned?: boolean };
  if (body.staffId && body.assigned !== undefined) {
    if (body.assigned) await assignStaffToService(domain, { userId, businessId, serviceId, staffId: body.staffId });
    else await unassignStaffFromService(domain, { userId, businessId, serviceId, staffId: body.staffId });
  } else {
    const { staffId: _staffId, assigned: _assigned, ...serviceUpdate } = body;
    await updateService(domain, { ...serviceUpdate, userId, businessId, serviceId });
  }
  return NextResponse.json({ ok: true });
});

export const DELETE = operatorRoute<{ serviceId: string }>(async ({ userId, businessId, domain }, { serviceId }) => {
  await deleteService(domain, { userId, businessId, serviceId });
  return NextResponse.json({ ok: true });
});
