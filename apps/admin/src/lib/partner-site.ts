import { SUPPORTED_LOCALES } from "./locale";
import { localeFromPathname, stripLocalePrefix } from "./locale-path";

// A partner's copy of the public pages the host prerenders at build, such as
// sign-in and sign-up. A build can't read a partner's brand, so the proxy
// rewrites these pages on a partner's host to this internal tree, which
// renders each partner's copy on its first visit, keeps it as a static page
// and renders it again once the cache window passes or the partner saves its
// brand. Visitors never see the prefix, and every host answers it with a 404,
// the way the marketing site's /site is hidden.

/** The internal segment partner pages live under. */
export const PARTNER_SITE_PREFIX = "/partner-site";

/**
 * How long a partner's public page is kept before it's rendered again, in
 * seconds. Saving a brand renders it again on its next visit on the process
 * that saved it; the others show the change once this window passes.
 */
export const PARTNER_SITE_REVALIDATE_SECONDS = 60;

/** What shared caches may keep a partner's public page for: the same window. */
export const PARTNER_SITE_CACHE_CONTROL = `public, s-maxage=${PARTNER_SITE_REVALIDATE_SECONDS}, stale-while-revalidate=${PARTNER_SITE_REVALIDATE_SECONDS}`;

/**
 * The public pages the host prerenders at build: every page directly under
 * app/(public)/[locale], each with a copy in app/(partner-site). partner-site.test.ts
 * checks both, and scripts/verify-admin-prerender.ts checks the same list.
 */
export const PRERENDERED_PUBLIC_SECTIONS = new Set([
  "accept-invite",
  "claim-demo",
  "confirm-email-change",
  "demo",
  "forgot-password",
  "login",
  "reset-password",
  "signup",
]);

/** The root of a partner's tree. */
export function partnerSiteRoot(partnerId: string): string {
  return `${PARTNER_SITE_PREFIX}/${partnerId}`;
}

/**
 * Every page in a partner's tree, in every locale, as the proxy rewrites to
 * them: what saving the partner's brand passes to revalidatePath. Next.js tags
 * each cached page with its own path, not with the tree's root, so each one
 * is named. The proxy rewrites with the id the database gave, in lowercase.
 */
export function partnerSitePages(partnerId: string): string[] {
  const root = partnerSiteRoot(partnerId.toLowerCase());
  return SUPPORTED_LOCALES.flatMap((locale) => [...PRERENDERED_PUBLIC_SECTIONS].map((section) => `${root}/${locale}/${section}`));
}

/**
 * Where a localized prerendered public page, such as /fr/login, lives in a
 * partner's tree, or null for any other path, which a page rendered per
 * request already shows under the request's brand.
 */
export function partnerSitePath(partnerId: string, pathname: string): string | null {
  const locale = localeFromPathname(pathname);
  if (!locale) return null;
  const section = stripLocalePrefix(pathname).slice(1);
  return PRERENDERED_PUBLIC_SECTIONS.has(section) ? `${partnerSiteRoot(partnerId)}/${locale}/${section}` : null;
}

/** Whether a path asks for the internal tree itself, which no host serves to visitors. */
export function isPartnerSitePath(pathname: string): boolean {
  return pathname === PARTNER_SITE_PREFIX || pathname.startsWith(`${PARTNER_SITE_PREFIX}/`);
}
