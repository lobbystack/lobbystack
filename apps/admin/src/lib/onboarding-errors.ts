type Translate = (key: string) => string;

function getErrorText(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  return error instanceof Error ? error.message : "";
}

function includesAny(value: string, needles: string[]): boolean {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

export function getSafeOnboardingErrorMessage(
  error: unknown,
  t: Translate,
  fallbackKey: string,
): string {
  const message = getErrorText(error);

  if (includesAny(message, ["Too many workspace creation attempts"])) {
    return t("errors.tooManyBusinesses");
  }

  if (includesAny(message, ["Too many number searches"])) {
    return t("number.tooManySearches");
  }

  if (includesAny(message, ["no longer available", "number is unavailable"])) {
    return t("number.unavailable");
  }

  if (includesAny(message, ["Number provisioning limit reached"])) {
    return t("number.claimRateLimited");
  }

  if (includesAny(message, ["Trial accounts can only buy eligible trial numbers"])) {
    return t("number.trialAccountPurchaseLimit");
  }

  return t(fallbackKey);
}
