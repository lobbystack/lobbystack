"use client";

import { usePathname } from "next/navigation";

import { LiveDemosSurface, type PartnerDemoChange } from "@/components/live-demos-surface";
import { useConsolePartner } from "@/components/partner-shell";
import { useTelemetry } from "@/components/product-analytics";

/**
 * The partner console's Demos page: the host's demo page, on the partner's
 * demos. Everyone on the team makes, publishes and turns off its demos, and
 * opens one to work inside it, which records the same event as opening a
 * business. Owners and admins pick a demo's access level and delete a closed
 * one, which records the same event as deleting a business. The server
 * enforces who may.
 */
export function PartnerDemosSurface() {
  const partner = useConsolePartner();
  const telemetry = useTelemetry();
  const pathname = usePathname() ?? "/partner";
  const record = (change: PartnerDemoChange) => {
    const base = { partnerId: partner.partnerId, businessId: change.businessId, pathname };
    if (change.action === "created") telemetry.track("web.partner.demo_created", { ...base, prospectDemoId: change.demoId, accessLevel: change.accessLevel });
    if (change.action === "published") telemetry.track("web.partner.demo_published", { ...base, prospectDemoId: change.demoId });
    if (change.action === "revoked") telemetry.track("web.partner.demo_revoked", { ...base, prospectDemoId: change.demoId });
    if (change.action === "opened") telemetry.track("web.partner.business_opened", base);
    if (change.action === "deleted") telemetry.track("web.partner.business_deleted", base);
  };
  return <LiveDemosSurface partner={{ partnerId: partner.partnerId, canManage: partner.role === "owner" || partner.role === "admin", onChange: record }} />;
}
