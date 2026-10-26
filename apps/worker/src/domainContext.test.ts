import { describe, expect, it } from "vitest";

import { StripeConnectAdapter } from "@lobbystack/providers/stripe/stripeConnect";

import { createWorkerDomainContext } from "./domainContext";

describe("the worker's domain context", () => {
  const db = {} as never;

  it("reaches Stripe Connect when the deployment has it, so the partner lifecycle can cancel a deleted business's subscription", () => {
    const context = createWorkerDomainContext({ db }, { STRIPE_CONNECT_SECRET_KEY: "sk_test_platform", STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_test_partner_connect" });
    expect(context.db).toBe(db);
    expect(context.stripeConnect).toBeInstanceOf(StripeConnectAdapter);
  });

  it("has no Stripe Connect client without both variables", () => {
    expect(createWorkerDomainContext({ db }, {})).not.toHaveProperty("stripeConnect");
    expect(createWorkerDomainContext({ db }, { STRIPE_CONNECT_SECRET_KEY: "sk_test_platform" })).not.toHaveProperty("stripeConnect");
  });
});
