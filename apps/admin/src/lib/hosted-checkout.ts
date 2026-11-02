import type { HostedCheckoutPlanIntervals } from "@lobbystack/shared";

/** The plans and billing intervals this deployment can sell, from its Polar products. Nothing for someone without checkout access. */
export function hostedCheckoutOptions(hasCheckoutAccess: boolean): { availableCheckoutPlans: Array<"starter" | "pro">; availableCheckoutIntervals: HostedCheckoutPlanIntervals } {
  const availableCheckoutIntervals: HostedCheckoutPlanIntervals = { starter: [], pro: [] };
  if (hasCheckoutAccess) for (const plan of ["starter", "pro"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      if (process.env[`POLAR_${plan.toUpperCase()}_${interval.toUpperCase()}_PRODUCT_ID`]) availableCheckoutIntervals[plan].push(interval);
    }
  }
  return { availableCheckoutPlans: (["starter", "pro"] as const).filter((plan) => availableCheckoutIntervals[plan].length > 0), availableCheckoutIntervals };
}
