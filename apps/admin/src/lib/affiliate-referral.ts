const AFFILIATE_REFERRAL_STORAGE_KEY = "lobbystack.affiliate.referralCode";
const AFFILIATE_VISITOR_STORAGE_KEY = "lobbystack.affiliate.visitorId";

export function normalizeClientReferralCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function getStoredAffiliateReferralCode(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const referralCode = normalizeClientReferralCode(
    window.localStorage.getItem(AFFILIATE_REFERRAL_STORAGE_KEY) ?? "",
  );
  return referralCode || null;
}

export function storeAffiliateReferralCode(referralCode: string): void {
  window.localStorage.setItem(AFFILIATE_REFERRAL_STORAGE_KEY, referralCode);
}

export function clearAffiliateReferralCode(): void {
  window.localStorage.removeItem(AFFILIATE_REFERRAL_STORAGE_KEY);
}

export function getAffiliateVisitorId(): string {
  const existing = window.localStorage.getItem(AFFILIATE_VISITOR_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(AFFILIATE_VISITOR_STORAGE_KEY, next);
  return next;
}
