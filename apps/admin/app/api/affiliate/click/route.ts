import { NextResponse } from "next/server";
import { normalizeIP } from "@better-auth/core/utils/ip";

import { normalizeAffiliateReferralCode, recordAffiliateClick } from "@lobbystack/domain";
import { asApiResponse, jsonError, readJson } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { enforceFixedWindow, fixedWindowLimit } from "@/lib/fixed-window-limit";
import { trustedClientIp } from "@/lib/trusted-client-ip";

const hour = 60 * 60;

export async function POST(request: Request) {
  try {
    const parsed = await readJson(request);
    const body = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    if (typeof body.referralCode !== "string") return jsonError("A referralCode is required.", 400);
    // This endpoint is public and visitorId is caller-chosen, so only these windows bound the writes.
    const limits = [fixedWindowLimit("affiliate-click", "code-hour", normalizeAffiliateReferralCode(body.referralCode), 500, hour, "rate_limit_code_hour")];
    const ip = trustedClientIp(request);
    // One host usually owns a whole IPv6 /64, so count the subnet as one client.
    if (ip) limits.push(fixedWindowLimit("affiliate-click", "ip-hour", normalizeIP(ip, { ipv6Subnet: 64 }), 30, hour, "rate_limit_ip_hour"));
    // A click only feeds statistics, so a limited click is dropped rather than reported as an error.
    if (!(await enforceFixedWindow(limits)).allowed) return NextResponse.json({ recorded: false });
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
