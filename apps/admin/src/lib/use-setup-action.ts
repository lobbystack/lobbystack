"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Open the setup guide's target once the workspace permissions are available. */
export function useSetupAction(enabled: boolean, open: (action: string) => boolean) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const handled = useRef<string | null>(null);
  const query = searchParams.toString();
  useEffect(() => {
    const params = new URLSearchParams(query);
    const action = params.get("setup");
    if (!action) { handled.current = null; return; }
    if (!enabled || handled.current === query || !open(action)) return;
    handled.current = query;
    params.delete("setup");
    const remaining = params.toString();
    router.replace(`${pathname}${remaining ? `?${remaining}` : ""}`, { scroll: false });
  }, [enabled, open, pathname, query, router]);
}
