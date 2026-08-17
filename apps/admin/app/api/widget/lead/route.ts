import { NextResponse } from "next/server";

import { registerWidgetVisitor } from "@lobbystack/domain";
import { widgetLeadRequestSchema } from "@lobbystack/shared";

import { readJson } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { resolveWidgetAccess } from "@/lib/widget-access";
import { isValidUuid, requestIpHash } from "@/lib/widget-keys";
import { enforceWidgetRateLimits } from "@/lib/widget-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = widgetLeadRequestSchema.parse(await readJson(request));
    const access = await resolveWidgetAccess(request, body.widgetKey);
    if (!access.ok) return access.response;
    const { session } = access;
    const rate = await enforceWidgetRateLimits({ businessId: session.businessId, widgetKeyId: session.widgetKeyId, visitorId: body.visitorId, ...(requestIpHash(request) ? { ipHash: requestIpHash(request) } : {}), operation: "lead" }, { consume: true });
    if (!rate.allowed) return NextResponse.json({ error: "Rate limit reached.", code: rate.code }, { status: rate.status });
    if (!isValidUuid(body.visitorId)) return NextResponse.json({ error: "A valid visitorId is required.", code: "visitor_required" }, { status: 400 });

    const context = createWorkerDomainContext();
    const result = await registerWidgetVisitor(context, {
      businessId: session.businessId,
      visitorId: body.visitorId,
      ...(body.name ? { name: body.name } : {}),
      ...(body.email ? { email: body.email } : {}),
      ...(body.phone ? { phone: body.phone } : {}),
      metadata: { userAgent: request.headers.get("user-agent") ?? undefined, submittedLead: true },
    });

    return NextResponse.json({ ok: true, contactId: result.contactId, visitorId: result.visitorId });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    const status = error !== null && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return NextResponse.json({ error: status >= 500 ? "Request failed." : error instanceof Error ? error.message : "Request failed." }, { status });
  }
}
