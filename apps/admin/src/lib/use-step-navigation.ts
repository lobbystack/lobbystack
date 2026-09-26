"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * A mutation settles as soon as its request resolves, but the next route is
 * still loading, so a button tied to `isPending` flips back to its idle label
 * for the gap in between. Pushing inside a transition keeps `navigating` true
 * until the new step has committed, so the spinner runs to the end.
 */
export function useStepNavigation() {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();

  const navigate = useCallback((href: string) => {
    startNavigation(() => {
      router.push(href);
    });
  }, [router]);

  const prefetch = useCallback((href: string) => {
    router.prefetch(href);
  }, [router]);

  return { navigate, navigating, prefetch, router };
}
