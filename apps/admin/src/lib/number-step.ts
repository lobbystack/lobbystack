"use client";

import { useRouter } from "next/navigation";

import { requestJson } from "@/lib/request-json";

/**
 * Opens the number step for the workspace the offer was shown in. The step
 * uses the account's active workspace, which another tab may have switched.
 */
export function useOpenNumberStep() {
  const router = useRouter();
  return async (businessId: string) => {
    // If the switch fails, the step still opens on the active workspace.
    await requestJson("/api/businesses/switch", { method: "POST", body: JSON.stringify({ businessId }) }).catch(() => undefined);
    router.push("/onboarding/number");
  };
}
