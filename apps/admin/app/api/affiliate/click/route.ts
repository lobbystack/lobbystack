import { NextResponse } from "next/server";

import { recordAffiliateClick } from "@lobbystack/domain";
import { asApiResponse, readJson } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export async function POST(request: Request) {
  try {
    const parsed = await readJson(request);
    const body = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    if (typeof body.referralCode !== "string") return NextResponse.json({ error: "A referralCode is required." }, { status: 400 });
    const recorded = await recordAffiliateClick(createDomainContext(), {
      referralCode: body.referralCode,
      ...(typeof body.visitorId === "string" ? { visitorId: body.visitorId.slice(0, 100) } : {}),
      ...(typeof body.sourceUrl === "string" ? { sourceUrl: body.sourceUrl } : {}),
    });
    return NextResponse.json({ recorded });
  } catch (error) {
    return asApiResponse(error);
  }
}
