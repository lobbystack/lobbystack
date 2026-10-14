/** Answers to the cancel dialog's optional question, in the order it lists them. */
export const cancellationReasons = ["setup", "quality", "price", "missing_feature", "other"] as const;

export type CancellationReason = (typeof cancellationReasons)[number];

export function isCancellationReason(value: unknown): value is CancellationReason {
  return cancellationReasons.includes(value as CancellationReason);
}
