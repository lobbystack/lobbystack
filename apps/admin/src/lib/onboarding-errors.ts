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
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;

  if (code === "website_url_invalid") {
    return t("website.invalidUrl");
  }

  const phoneErrors: Record<string, string> = {
    phone_voip_refused: "verifyPhone.errors.voip",
    phone_not_mobile: "verifyPhone.errors.notMobile",
    phone_country_mismatch: "verifyPhone.errors.countryMismatch",
    phone_number_invalid: "verifyPhone.errors.invalidNumber",
    verification_rate_limited: "verifyPhone.errors.rateLimited",
    verification_cooldown: "verifyPhone.errors.rateLimited",
  };
  if (typeof code === "string" && phoneErrors[code]) {
    return t(phoneErrors[code]);
  }

  if (includesAny(message, ["Too many workspaces"])) {
    return t("errors.tooManyBusinesses");
  }

  if (includesAny(message, ["Too many number searches"])) {
    return t("number.tooManySearches");
  }

  if (includesAny(message, ["no longer available", "number is unavailable"])) {
    return t("number.unavailable");
  }

  if (code === "number_offer_expired") {
    return t("number.offerExpired");
  }

  if (code === "number_claim_rate_limited" || code === "daily_claim_quota_reached" || code === "monthly_claim_quota_reached") {
    return t("number.claimRateLimited");
  }

  if (includesAny(message, ["Trial accounts can only buy eligible trial numbers"])) {
    return t("number.trialAccountPurchaseLimit");
  }

  return t(fallbackKey);
}
