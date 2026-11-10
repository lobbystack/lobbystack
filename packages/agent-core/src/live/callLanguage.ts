import { defaultGreeting, normalizeRuntimeLocale, type BusinessContextSnapshot, type RuntimeLocale } from "@lobbystack/shared";

/**
 * The snapshot for a call that starts in a language the caller picked, as on the
 * landing site's demo. The receptionist speaks it from the first word, so the
 * greeting is the standard one in that language, not the business's own. A call
 * in the business's default language keeps the business's greeting.
 */
export function withCallLanguage(snapshot: BusinessContextSnapshot, language: RuntimeLocale | undefined): BusinessContextSnapshot {
  if (!language || language === normalizeRuntimeLocale(snapshot.defaultLocale)) return snapshot;
  return { ...snapshot, defaultLocale: language, greeting: defaultGreeting(snapshot.displayName, language) };
}
