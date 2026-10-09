import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { phoneNumbers, withBusinessTransaction } from "@lobbystack/db";
import { registerWidgetVisitor } from "@lobbystack/domain";
import { isUuid, widgetLeadRequestSchema } from "@lobbystack/shared";

import { readJson } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { getLocalePhoneCountry, inferPhoneCountry, normalizePhoneNumber } from "@/lib/phone";
import { resolveWidgetSessionAccess } from "@/lib/widget-access";
import { requestIpHash } from "@/lib/widget-keys";
import { enforceWidgetRateLimits } from "@/lib/widget-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const parsed = widgetLeadRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      return NextResponse.json({ error: "The lead details are invalid.", code: field === "email" || field === "phone" ? `invalid_${field}` : "widget_lead_input_invalid" }, { status: 400 });
    }
    const body = parsed.data;
    const access = await resolveWidgetSessionAccess(request);
    if (!access.ok) return access.response;
    const { session } = access;
    if (session.visitorId !== body.visitorId) return NextResponse.json({ error: "The visitor does not match the widget session.", code: "widget_visitor_mismatch" }, { status: 403 });
    const rate = await enforceWidgetRateLimits({ businessId: session.businessId, widgetKeyId: session.widgetKeyId, visitorId: body.visitorId, ...(requestIpHash(request) ? { ipHash: requestIpHash(request) } : {}), operation: "lead" });
    if (!rate.allowed) return NextResponse.json({ error: "Rate limit reached.", code: rate.code }, { status: rate.status });
    if (!isUuid(body.visitorId)) return NextResponse.json({ error: "A valid visitorId is required.", code: "visitor_required" }, { status: 400 });

    const context = createWorkerDomainContext();
    let phone: string | undefined;
    if (body.phone?.trim()) {
      // Store E.164 so a returning caller matches their existing contact. Visitors type local numbers: read them in the business's
      // own country first, then in the country of the visitor's browser language.
      const businessNumber = await withBusinessTransaction(context.db, { businessId: session.businessId, actorType: "worker" }, async (tx) =>
        (await tx.select({ e164: phoneNumbers.e164 }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, session.businessId), eq(phoneNumbers.status, "active"))).limit(1))[0]?.e164);
      const browserLocale = request.headers.get("accept-language")?.split(",")[0]?.split(";")[0];
      for (const country of [inferPhoneCountry(businessNumber), getLocalePhoneCountry(browserLocale)]) phone ??= normalizePhoneNumber(body.phone, { defaultCountry: country ?? null });
      if (!phone) return NextResponse.json({ error: "Enter a valid phone number.", code: "invalid_phone" }, { status: 400 });
    }
    const result = await registerWidgetVisitor(context, {
      businessId: session.businessId,
      visitorId: body.visitorId,
      ...(body.name ? { name: body.name } : {}),
      ...(body.email ? { email: body.email } : {}),
      ...(phone ? { phone } : {}),
      metadata: { userAgent: request.headers.get("user-agent") ?? undefined, submittedLead: true },
    });

    return NextResponse.json({ ok: true, contactId: result.contactId, visitorId: result.visitorId });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    const status = error !== null && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return NextResponse.json({ error: status >= 500 ? "Request failed." : error instanceof Error ? error.message : "Request failed." }, { status });
  }
}
