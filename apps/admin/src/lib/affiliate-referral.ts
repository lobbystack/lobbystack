const AFFILIATE_REFERRAL_STORAGE_KEY = "lobbystack.affiliate.referralCode";
const AFFILIATE_VISITOR_STORAGE_KEY = "lobbystack.affiliate.visitorId";

// Storage can be missing or throw (blocked site data, some private windows).
// Referral tracking is best effort and must never break signup or onboarding.
function readStorage(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Keep going without persistence.
  }
}

export function normalizeClientReferralCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    // Matches the 64-character referral_code column and the server normalizer.
    .slice(0, 64);
}

export function captureAffiliateReferralFromUrl(url: URL): string | null {
  const referralCode = normalizeClientReferralCode(url.searchParams.get("ref") || url.searchParams.get("via") || "");
  if (!referralCode) return null;
  writeStorage(AFFILIATE_REFERRAL_STORAGE_KEY, referralCode);
  return referralCode;
}

export function getStoredAffiliateReferralCode(): string | null {
  return normalizeClientReferralCode(readStorage(AFFILIATE_REFERRAL_STORAGE_KEY) ?? "") || null;
}

export function clearAffiliateReferralCode(): void {
  writeStorage(AFFILIATE_REFERRAL_STORAGE_KEY, null);
}

export function getAffiliateVisitorId(): string {
  const existing = readStorage(AFFILIATE_VISITOR_STORAGE_KEY);
  if (existing) return existing;
  const next = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  writeStorage(AFFILIATE_VISITOR_STORAGE_KEY, next);
  return next;
}
