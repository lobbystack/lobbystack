import { isIP } from "node:net";
import { trimTrailingSlashes } from "@lobbystack/shared";

// The operator can fix these, so the API answers 422 with the message instead of a server error.
function invalidWebsiteUrl(message: string): Error {
  return Object.assign(new Error(message), { status: 422, code: "website_url_invalid" });
}

/** `keepQuery` is for crawled pages: on sites with links like `/?page_id=2`, the query is what tells pages apart. */
export function normalizeWebsiteSourceUrl(value: string, options: { keepQuery?: boolean } = {}): string {
  const trimmed = value.trim();
  // A colon before a digit starts a port, as in example.com:8080, not a scheme.
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw invalidWebsiteUrl("Enter a valid website URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw invalidWebsiteUrl("Website URL must use HTTP or HTTPS.");
  if (url.username || url.password) throw invalidWebsiteUrl("Website URL must not include credentials.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || [".localhost", ".local", ".localdomain", ".home.arpa"].some((suffix) => hostname.endsWith(suffix)) || isIP(hostname.replace(/^\[|\]$/g, ""))) throw invalidWebsiteUrl("Website URL must use a public hostname.");
  const path = url.pathname === "/" ? "/" : trimTrailingSlashes(url.pathname);
  if (!options.keepQuery) return `${url.origin}${path}`;
  // Tracking and comment-reply links show the same page, so they must not become separate documents.
  for (const key of [...url.searchParams.keys()]) if (/^(utm_.*|gclid|fbclid|msclkid|replytocom)$/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return `${url.origin}${path}${url.search}`;
}
