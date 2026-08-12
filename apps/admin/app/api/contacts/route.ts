import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { contacts } from "@lobbystack/db";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => ({ contacts: await tx.select().from(contacts).where(eq(contacts.businessId, businessId)).orderBy(asc(contacts.name)).limit(100) }))); } catch (error) { return asApiResponse(error); }
}
