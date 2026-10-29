import { NextResponse } from "next/server";

import { listOpenUnansweredQuestions } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ userId, businessId, domain }) => NextResponse.json(await listOpenUnansweredQuestions(domain, { userId, businessId })));
