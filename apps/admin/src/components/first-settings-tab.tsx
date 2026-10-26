"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useBusinessCan } from "@/components/business-capabilities-provider";
import { firstSettingsPage } from "@/lib/dashboard-pages";

/** Opens the first Settings tab the business lets the person use, the one the menu's Settings link goes to. */
export function FirstSettingsTab() {
  const can = useBusinessCan();
  const router = useRouter();
  const target = firstSettingsPage(can);
  useEffect(() => { router.replace(target); }, [router, target]);
  return null;
}
