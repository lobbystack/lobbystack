import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { decideStaffFirstCall, loadStaffFirstHandover, loadStaffPrompt, recordStaffAnsweredCall, resolveRefusedCallForward } from "@lobbystack/domain";
import { appBaseUrl, sipAddress } from "@lobbystack/providers/telephony/config";
import { dialReceptionistTwiml, emptyTwiml, forwardTwiml, hangupTwiml, receptionistDialOutcome, referTargetPhone, referTwiml, rejectTwiml, ringStaffTwiml, staffDialOutcome, staffPressTwiml, staffPromptTwiml } from "@lobbystack/providers/twilio/staffFirstTwiml";
import { resolveTwilioWebhookUrl, validateTwilioSignature } from "@lobbystack/providers/twilio/webhookSecurity";
import { isTransferPhone, type RuntimeLocale } from "@lobbystack/shared";
import { getAppDatabase } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function twiml(body: string): NextResponse {
  return new NextResponse(body, { status: 200, headers: { "content-type": "text/xml" } });
}

function stepUrl(step: string, query: Record<string, string> = {}): string {
  const url = new URL(`${appBaseUrl()}/api/webhooks/twilio/staff-first/${step}`);
  for (const [name, value] of Object.entries(query)) if (value) url.searchParams.set(name, value);
  return url.toString();
}

async function businessForNumber(phones: Array<string | undefined>): Promise<{ businessId: string; called: string } | undefined> {
  const dialled = [...new Set(phones.filter((phone): phone is string => Boolean(phone && E164_PATTERN.test(phone))))];
  for (const called of dialled) {
    const businessId = (await getAppDatabase().db.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_phone(${called}) as business_id`)).rows[0]?.business_id;
    if (businessId) return { businessId, called };
  }
  return undefined;
}

function dialReceptionist(input: { businessId: string; called: string; locale: RuntimeLocale; message?: string | undefined }): string | undefined {
  const sip = sipAddress();
  if (!sip) return undefined;
  return dialReceptionistTwiml({ sipAddress: sip, called: input.called, locale: input.locale, message: input.message, actionUrl: stepUrl("receptionist-result", { business: input.businessId, called: input.called }), referUrl: stepUrl("refer") });
}

/** A call the receptionist can't take, handled as on the trunk's disaster recovery URL: forwarded when the business has somewhere to send it, otherwise busy. */
async function refusedCall(input: { businessId: string; called: string; forwardedFrom?: string | undefined }): Promise<string> {
  const to = await resolveRefusedCallForward(createWorkerDomainContext(), { businessId: input.businessId, e164: input.called, forwardedFrom: input.forwardedFrom });
  return to ? forwardTwiml(to) : rejectTwiml();
}

/** refusedCall on a step with no voice fallback, so a database error still answers Twilio. */
async function refusedCallOrBusy(input: { businessId: string; called: string; forwardedFrom?: string | undefined }): Promise<string> {
  try {
    return await refusedCall(input);
  } catch (error) {
    console.error("[staff-first] couldn't forward a refused call", error instanceof Error ? error.message : error);
    return rejectTwiml();
  }
}

const callerPhone = (from: string | undefined) => from && E164_PATTERN.test(from) ? from : undefined;

/**
 * The webhooks behind staff answers first. See docs/specs/staff-answers-first.md.
 *
 * incoming: Twilio asks what to do with a call to a staff-first number.
 * fallback: the number's voice fallback URL, for when incoming fails. It reads
 *   nothing from the database, so the caller reaches the receptionist anyway.
 * staff-prompt, staff-press: the staff leg, which bridges only on a press of 1.
 * staff-result: the ring ended. An accepted call is over; anything else goes
 *   to the receptionist.
 * receptionist-result: the leg to GPT-Live ended, or GPT-Live refused the call.
 * refer: the receptionist transferred the call.
 */
export async function POST(request: Request, { params: route }: { params: Promise<{ step: string }> }) {
  const { step } = await route;
  const rawBody = await request.text();
  const params: Record<string, string> = Object.fromEntries(new URLSearchParams(rawBody));
  // Trial numbers belong to the main account, which signs with its auth token.
  const authToken = request.headers.get("x-twilio-signature-key-sid") ? undefined : process.env.TWILIO_AUTH_TOKEN;
  const publicUrl = process.env.APP_BASE_URL ? stepUrl(step) : undefined;
  if (!validateTwilioSignature({ authToken, signatureHeader: request.headers.get("x-twilio-signature"), url: resolveTwilioWebhookUrl(request.url, publicUrl), params })) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const query = new URL(request.url).searchParams;
  const businessId = query.get("business") ?? "";
  const called = query.get("called") ?? "";
  const domain = createWorkerDomainContext();

  switch (step) {
    case "incoming": {
      try {
        const routed = await businessForNumber([params.To, params.Called]);
        if (!routed) return twiml(rejectTwiml());
        const decision = await decideStaffFirstCall(domain, { businessId: routed.businessId, e164: routed.called, providerCallId: params.CallSid ?? "", from: callerPhone(params.From), forwardedFrom: params.ForwardedFrom });
        if (decision.action === "reject") return twiml(rejectTwiml());
        if (decision.action === "ring") {
          return twiml(ringStaffTwiml({
            staffPhone: decision.phone,
            ringSeconds: decision.ringSeconds,
            message: decision.message,
            locale: decision.locale,
            actionUrl: stepUrl("staff-result", { business: routed.businessId, called: routed.called }),
            promptUrl: stepUrl("staff-prompt", { business: routed.businessId }),
          }));
        }
        return twiml(dialReceptionist({ ...routed, locale: decision.locale }) ?? await refusedCall({ ...routed, forwardedFrom: params.ForwardedFrom }));
      } catch (error) {
        // The number's voice fallback URL takes it from here.
        console.error("[staff-first] incoming call failed", error instanceof Error ? error.message : error);
        return new NextResponse("Temporary webhook failure.", { status: 500 });
      }
    }
    case "fallback": {
      const dialled = [params.To, params.Called].find((phone) => phone && E164_PATTERN.test(phone));
      const body = dialled ? dialReceptionist({ businessId: "", called: dialled, locale: "en" }) : undefined;
      return twiml(body ?? rejectTwiml());
    }
    case "staff-prompt": {
      // Hanging up the staff leg leaves the call to the receptionist.
      if (!businessId) return twiml(hangupTwiml());
      try {
        const prompt = await loadStaffPrompt(domain, { businessId, from: callerPhone(params.From) });
        return twiml(staffPromptTwiml({ ...prompt, pressUrl: stepUrl("staff-press") }));
      } catch (error) {
        console.error("[staff-first] couldn't read the staff prompt", error instanceof Error ? error.message : error);
        return twiml(hangupTwiml());
      }
    }
    case "staff-press":
      return twiml(staffPressTwiml(params.Digits));
    case "staff-result": {
      const outcome = staffDialOutcome(params);
      if (outcome === "caller_gone") return twiml(emptyTwiml());
      if (outcome === "accepted") {
        // The call happened either way, so a failed write only costs the record and its seconds toward the cap.
        await recordStaffAnsweredCall(domain, { businessId, providerCallId: params.CallSid ?? "", from: callerPhone(params.From), to: called, seconds: Number(params.DialCallDuration) || 0 }).catch((error: unknown) => console.error("[staff-first] couldn't record a staff-answered call", error instanceof Error ? error.message : error));
        return twiml(hangupTwiml());
      }
      // An action URL has no voice fallback, so a failed read still reaches the receptionist, without the message.
      const handover = await loadStaffFirstHandover(domain, { businessId }).catch((error: unknown) => {
        console.error("[staff-first] couldn't read the handover", error instanceof Error ? error.message : error);
        return { locale: "en" as const };
      });
      return twiml(dialReceptionist({ businessId, called, ...handover }) ?? await refusedCallOrBusy({ businessId, called, forwardedFrom: params.ForwardedFrom }));
    }
    case "receptionist-result": {
      const outcome = receptionistDialOutcome(params);
      if (outcome === "finished") return twiml(hangupTwiml());
      if (outcome === "blocked") return twiml(rejectTwiml());
      try {
        // The fallback step dials without reading the database, so it can't name the business.
        const routed = businessId ? { businessId, called } : await businessForNumber([called]);
        return twiml(routed ? await refusedCall({ ...routed, forwardedFrom: params.ForwardedFrom }) : rejectTwiml());
      } catch (error) {
        console.error("[staff-first] couldn't forward a refused call", error instanceof Error ? error.message : error);
        return twiml(rejectTwiml());
      }
    }
    case "refer": {
      const target = referTargetPhone(params.ReferTransferTarget);
      if (!target || !isTransferPhone(target)) {
        console.warn("[staff-first] refused a transfer target");
        return twiml(hangupTwiml());
      }
      return twiml(referTwiml(target));
    }
    default:
      return new NextResponse(null, { status: 404 });
  }
}
