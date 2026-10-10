import { NextResponse } from "next/server";

import { listCurrentAppointments } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx) => ({ appointments: await listCurrentAppointments(tx, businessId, new Date()) }))));
