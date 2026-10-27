import { describe, expect, it } from "vitest";

import { subscriptionEventEffect } from "./polarSubscriptions";

const effect = (input: Partial<Parameters<typeof subscriptionEventEffect>[0]>) =>
  subscriptionEventEffect({ storedSubscriptionId: "sub_plan", eventSubscriptionId: "sub_plan", sellsNothing: false, startsLivePlan: false, ...input });

describe("subscriptionEventEffect", () => {
  it("applies events about the subscription the account stores", () => {
    expect(effect({})).toBe("apply");
    expect(effect({ storedSubscriptionId: null, eventSubscriptionId: "sub_first" })).toBe("apply");
    expect(effect({ eventSubscriptionId: undefined })).toBe("apply");
  });

  it("lets a live plan on a new subscription replace the stored one", () => {
    expect(effect({ eventSubscriptionId: "sub_new", startsLivePlan: true })).toBe("apply");
  });

  it("ignores another subscription of the same customer that isn't a live plan", () => {
    // A late cancellation of an old plan, or a product this deployment doesn't map.
    expect(effect({ eventSubscriptionId: "sub_old" })).toBe("ignore");
  });

  it("ends the hosted plan when its own subscription moves to a support product or the other catalog's", () => {
    expect(effect({ sellsNothing: true })).toBe("end");
  });

  it("ignores a support subscription the account doesn't store, whatever its state", () => {
    expect(effect({ sellsNothing: true, eventSubscriptionId: "sub_support" })).toBe("ignore");
    expect(effect({ sellsNothing: true, storedSubscriptionId: null, eventSubscriptionId: "sub_support" })).toBe("ignore");
    expect(effect({ sellsNothing: true, eventSubscriptionId: undefined })).toBe("ignore");
  });
});
