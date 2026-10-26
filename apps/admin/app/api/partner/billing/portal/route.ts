import { NextResponse } from "next/server";

import { partnerBillingPortalCustomer } from "@lobbystack/domain";
import { PolarBillingProvider } from "@lobbystack/providers";
import { configuredAppOrigins } from "@/lib/app-origins";
import { partnerRoute } from "@/lib/partner-request";
import { partnerRequestOrigin } from "@/lib/request-brand";

export const dynamic = "force-dynamic";

/** Opens Polar's customer portal for the partner's tier, where an owner changes or cancels it and updates their card. */
export const POST = partnerRoute(async ({ actor, partnerId, request, domain }) => {
  const token = process.env.POLAR_ACCESS_TOKEN;
  const organizationId = process.env.POLAR_ORGANIZATION_ID;
  if (!token || !organizationId) throw new Error("Billing customer portal is not configured.");
  const { customerId } = await partnerBillingPortalCustomer(domain, actor);
  const origin = partnerRequestOrigin(request.headers) ?? configuredAppOrigins(process.env)[0] ?? new URL(request.url).origin;
  const provider = new PolarBillingProvider({ accessToken: token, organizationId, ...(process.env.POLAR_API_BASE_URL ? { baseUrl: process.env.POLAR_API_BASE_URL } : {}) });
  return NextResponse.json(await provider.createCustomerPortalSession({ customerId, returnUrl: `${origin}/partner/${partnerId}/billing` }));
});
