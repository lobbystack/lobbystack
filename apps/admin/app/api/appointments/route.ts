import { NextResponse } from "next/server";

import { listCurrentAppointments } from "@lobbystack/domain";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => ({ appointments: await listCurrentAppointments(tx, businessId, new Date()) })));
  } catch (error) {
    return asApiResponse(error);
  }
}
