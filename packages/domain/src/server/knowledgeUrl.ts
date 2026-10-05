import { isIP } from "node:net";

// The operator can fix these, so the API answers 422 with the message instead of a server error.
function invalidWebsiteUrl(message: string): Error {
  return Object.assign(new Error(message), { status: 422, code: "website_url_invalid" });
}

export function normalizeWebsiteSourceUrl(value: string): string {
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
  const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}
