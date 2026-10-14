const PLAN_KEY = "lobbystack.pricing.plan";

/** Keeps the plan picked on the pricing page through signup, including an OAuth round trip. */
export function rememberPlanFromUrl(search: string): void {
  const plan = new URLSearchParams(search).get("plan");
  if (plan !== "starter" && plan !== "pro") return;
  try {
    window.localStorage.setItem(PLAN_KEY, plan);
  } catch {
    // Storage is blocked, so the upgrade dialog falls back to Starter.
  }
}

/** The plan picked on the pricing page, if this browser kept one. */
export function rememberedPlan(): "starter" | "pro" | null {
  try {
    const plan = window.localStorage.getItem(PLAN_KEY);
    return plan === "starter" || plan === "pro" ? plan : null;
  } catch {
    return null;
  }
}
