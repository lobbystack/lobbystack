import { NextResponse } from "next/server";

import { getWorkspaceNavigation } from "@lobbystack/domain";
import { asApiResponse, jsonError, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { isNewNavigationEnabled } from "@/lib/navigation-flag";
import type { NavigationSnapshot } from "@/lib/navigation-routes";

export const dynamic = "force-dynamic";

/** The active business's navigation: flag, staff toggle and receptionists. */
export async function GET(request: Request) {
  try {
    const snapshot = await withOperatorTransaction(request, async ({ session, businessId }) => {
      const navigation = await getWorkspaceNavigation(createDomainContext(), { userId: session.user.id, businessId });
      if (!navigation) throw jsonError("Business not found.", 404, "business_not_found");
      return {
        businessId,
        businessName: navigation.businessName,
        timezone: navigation.timezone,
        newNavigation: isNewNavigationEnabled(navigation.featureFlags),
        staffEnabled: navigation.staffEnabled,
        canManage: ["business_owner", "business_admin"].includes(navigation.role),
        receptionists: navigation.receptionists,
      } satisfies NavigationSnapshot;
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    return asApiResponse(error);
  }
}
