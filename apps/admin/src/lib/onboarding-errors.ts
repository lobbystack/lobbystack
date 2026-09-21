type Translate = (key: string) => string;

function getErrorText(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  return error instanceof Error ? error.message : "";
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
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
  const code = getErrorCode(error);

  if (includesAny(message, ["Too many workspace creation attempts"])) {
    return t("errors.tooManyBusinesses");
  }

  if (includesAny(message, ["Too many verification attempts"])) {
    return t("verifyPhone.tooManyAttempts");
  }

  if (
    code === "phone_number_invalid" ||
    includesAny(message, [
      "Enter a valid mobile number",
      "A valid mobile phone number is required",
      "Invalid phone number",
    ])
  ) {
    return t("verifyPhone.invalidNumber");
  }

  if (code === "phone_number_not_mobile" || includesAny(message, ["A mobile phone number is required", "real mobile number", "landline", "VoIP"])) {
    return t("verifyPhone.mobileRequired");
  }

  if (code === "phone_country_unsupported" || includesAny(message, ["Phone verification is not supported in this country"])) {
    return t("verifyPhone.unsupportedCountry");
  }

  if (includesAny(message, ["Please wait a moment before retrying"])) {
    return t("verifyPhone.waitBeforeRetry");
  }

  if (includesAny(message, ["Start verification again"])) {
    return t("verifyPhoneCode.startAgain");
  }

  if (includesAny(message, ["verification code is invalid or expired"])) {
    return t("verifyPhoneCode.invalidCode");
  }

  if (includesAny(message, ["Too many number searches"])) {
    return t("number.tooManySearches");
  }

  if (includesAny(message, ["Verify your mobile number before choosing"])) {
    return t("number.verifyPhoneRequired");
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
