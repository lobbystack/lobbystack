import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { businesses } from "@lobbystack/db";
import { asApiResponse, businessIdFromRequest, requireApiSession, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = process.env.DASHBOARD_TEST_CALL_TOKEN?.trim();
    if (!token) return NextResponse.json({ error: "Dashboard test calls are not configured." }, { status: 503 });
    await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    return NextResponse.json(await withOperatorTransaction(request, async ({ tx }) => {
      const business = (await tx.select({ slug: businesses.slug }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
      if (!business) throw new Error("Business not found.");
      const expiresAt = Date.now() + 5 * 60_000;
      const payload = ["dashboard-test-call", business.slug, String(expiresAt), randomBytes(16).toString("hex")].join("|");
      return { proof: `${payload}|${createHmac("sha256", token).update(payload).digest("hex")}` };
    }, { minimumRole: "business_admin" }));
  } catch (error) { return asApiResponse(error); }
}
