import type { Row, WaitSpec } from "./operations";

// The work a command can wait on, and how each tells it's over and whether it failed.

// The API's reason, without its full stop, so it reads inside a sentence.
const reason = (data: Row) => (typeof data.error === "string" && data.error.trim() ? data.error.trim().replace(/\.$/, "") : "no reason was given");

export const claimWait: WaitSpec = {
  operation: "getPhoneNumberClaim",
  param: "claim_id",
  done: (data) => data.status === "claimed" || data.status === "failed",
  failed: (data) => (data.status === "failed" ? `The claim failed: ${reason(data)}. Search again for another number.` : undefined),
};

export const checkoutWait: WaitSpec = {
  operation: "getCheckout",
  param: "checkout_id",
  done: (data) => data.status === "ready" || data.status === "error",
  failed: (data) => (data.status === "error" ? `Polar couldn't make the checkout page: ${reason(data)}. Start another checkout.` : undefined),
};

export const sourceWait: WaitSpec = {
  operation: "getKnowledgeSource",
  param: "source_id",
  done: (data) => !["pending", "processing"].includes(String(data.status)),
  failed: (data) => (data.status === "error" ? `Reading it failed: ${reason(data)}.` : data.status === "cancelled" ? "Reading it was cancelled." : undefined),
};
