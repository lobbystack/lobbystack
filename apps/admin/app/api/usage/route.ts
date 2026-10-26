import { NextResponse } from "next/server";

import { readAllowanceUsageInTransaction } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

// The business's minutes and chats this month against its allowance, for
// every operator. Unlike /api/billing it carries no plan, prices or spend, so
// a partner's business, which has no billing, reads its usage here.
export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx) => await readAllowanceUsageInTransaction(tx, { businessId }))));
