import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { buildPhoneSessionConfig } from "@lobbystack/agent-core/live/session";
import { getCachedBusinessSnapshot } from "@lobbystack/domain";
import { getAppDatabase } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { attachWorkerToLiveSession, getLiveClient } from "@/lib/live-prototype";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SIP "To"/"From" headers look like `<sip:+15551234567@host>`, `"Name" <sip:...>`
// or `tel:+1555...`. Carriers sometimes drop the "+", so restore it.
function phoneFromSipHeader(value: string | undefined): string | undefined {
  const digits = value?.match(/(?:sip|tel):(\+?\d{6,15})\b/)?.[1];
  if (!digits) return undefined;
  return digits.startsWith("+") ? digits : `+${digits.length === 10 ? `1${digits}` : digits}`;
}

// OpenAI calls this when Twilio routes a call to our project's SIP endpoint.
// We pick the business from the dialled number, accept with client delegation,
// and hand the session to the worker.
export async function POST(request: Request) {
  if (process.env.LIVE_PROTOTYPE_ENABLED !== "true") return new NextResponse(null, { status: 404 });
  const client = getLiveClient();
  let event;
  try {
    event = await client.webhooks.unwrap(await request.text(), request.headers);
  } catch {
    return new NextResponse("Invalid signature.", { status: 400 });
  }
  if (event.type !== "live.transport.incoming") return new NextResponse(null, { status: 200 });

  const sessionId = event.data.session_id;
  const header = (name: string) => event.data.sip_headers.find((item) => item.name.toLowerCase() === name)?.value;
  // Twilio trunks rewrite "To" to our OpenAI SIP URI and keep the dialled
  // number in "Diversion".
  const to = phoneFromSipHeader(header("diversion")) ?? phoneFromSipHeader(header("to"));
  const from = phoneFromSipHeader(header("from"));
  try {
    const resolved = to ? await getAppDatabase().db.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_phone(${to}) as business_id`) : undefined;
    const businessId = resolved?.rows[0]?.business_id;
    const snapshot = businessId ? await getCachedBusinessSnapshot(createWorkerDomainContext(), { businessId }) : null;
    if (!businessId || !snapshot) {
      const routing = event.data.sip_headers.filter((item) => ["to", "from", "diversion", "p-called-party-id"].includes(item.name.toLowerCase()));
      console.warn("[live] no business for incoming call", JSON.stringify({ sessionId, to, businessId: businessId ?? null, routing }));
      await client.live.sessions.reject(sessionId, { status_code: 404 });
      return new NextResponse(null, { status: 200 });
    }
    await client.live.sessions.accept(sessionId, { session: buildPhoneSessionConfig(snapshot) });
    await attachWorkerToLiveSession({ sessionId, businessId, channel: "voice", ...(from ? { callerPhone: from } : {}) });
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error("[live] incoming call failed", error instanceof Error ? error.message : error);
    await client.live.sessions.reject(sessionId, { status_code: 503 }).catch(() => undefined);
    return new NextResponse(null, { status: 200 });
  }
}
