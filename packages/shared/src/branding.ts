// The name and logo a deployment shows in place of LobbyStack.
//
// A deployment sets them with BRAND_APP_NAME and BRAND_LOGO_URL, or its first
// owner picks them in onboarding and the database keeps them. For each field
// the environment variable wins over the saved value, and LobbyStack fills in
// whatever neither sets.

export const DEFAULT_APP_NAME = "LobbyStack";

/** The environment variables that set a deployment's branding. */
export const BRANDING_ENVIRONMENT = {
  appName: "BRAND_APP_NAME",
  logoUrl: "BRAND_LOGO_URL",
} as const;

export type BrandingField = keyof typeof BRANDING_ENVIRONMENT;

export type BrandingSource = "environment" | "database" | "default";

export const MAX_APP_NAME_LENGTH = 40;

/** The largest logo onboarding accepts, in bytes. */
export const MAX_BRAND_LOGO_BYTES = 256 * 1024;

export const brandLogoContentTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

export type BrandLogoContentType = (typeof brandLogoContentTypes)[number];

/** Where the admin serves a logo saved in the database. */
export const BRAND_LOGO_PATH = "/api/branding/logo";

export type Branding = {
  appName: string;
  /** The logo's URL, or null for the built-in LobbyStack mark. */
  logoUrl: string | null;
  sources: Record<BrandingField, BrandingSource>;
};

/** The deployment's saved choice. A null field was left to the default. */
export type SavedBranding = {
  appName: string | null;
  /** A digest of the saved logo, so its URL changes whenever the logo does. */
  logoVersion: string | null;
};

export type BrandingEnvironment = {
  appName: string | null;
  logoUrl: string | null;
  /** Variables that are set but hold nothing usable, so they count as unset. */
  invalid: Array<(typeof BRANDING_ENVIRONMENT)[BrandingField]>;
};

// Control, format and line separator characters, bidirectional overrides among
// them, would let a name rearrange or hide the text around it.
const UNSAFE_NAME_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** A name as the deployment shows it, or null when the value can't be one. */
export function normalizeAppName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_APP_NAME_LENGTH || UNSAFE_NAME_CHARACTERS.test(name)) return null;
  return name;
}

/**
 * A logo address the dashboard's content policy loads: an https URL, or a path
 * on the dashboard's own origin such as /brand/logo.svg. Anything else is null.
 */
export function normalizeLogoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) {
    return trimmed.startsWith("//") || /[\s\\]/.test(trimmed) ? null : trimmed;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The branding a deployment's environment variables set. */
export function readBrandingEnvironment(environment: Record<string, string | undefined>): BrandingEnvironment {
  const rawName = environment[BRANDING_ENVIRONMENT.appName];
  const rawLogo = environment[BRANDING_ENVIRONMENT.logoUrl];
  const appName = normalizeAppName(rawName);
  const logoUrl = normalizeLogoUrl(rawLogo);
  const invalid: BrandingEnvironment["invalid"] = [];
  if (rawName?.trim() && !appName) invalid.push(BRANDING_ENVIRONMENT.appName);
  if (rawLogo?.trim() && !logoUrl) invalid.push(BRANDING_ENVIRONMENT.logoUrl);
  return { appName, logoUrl, invalid };
}

/** The URL of a logo saved in the database, versioned so browsers may cache it for good. */
export function savedBrandLogoUrl(logoVersion: string): string {
  return `${BRAND_LOGO_PATH}?v=${encodeURIComponent(logoVersion)}`;
}

/** Each field from the environment, else the saved choice, else LobbyStack. */
export function resolveBranding(input: { environment: Pick<BrandingEnvironment, "appName" | "logoUrl">; saved: SavedBranding | null }): Branding {
  const savedName = normalizeAppName(input.saved?.appName);
  const savedLogo = input.saved?.logoVersion ? savedBrandLogoUrl(input.saved.logoVersion) : null;
  return {
    appName: input.environment.appName ?? savedName ?? DEFAULT_APP_NAME,
    logoUrl: input.environment.logoUrl ?? savedLogo,
    sources: {
      appName: input.environment.appName ? "environment" : savedName ? "database" : "default",
      logoUrl: input.environment.logoUrl ? "environment" : savedLogo ? "database" : "default",
    },
  };
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);
}

// Markup that can run script or pull in other documents when an SVG is opened
// on its own, plus entity declarations, which can expand without bound. The
// logo route also serves every SVG under a sandboxed content policy.
const UNSAFE_SVG_PATTERNS = [
  /<\s*script\b/i,
  /<\s*foreignObject\b/i,
  /<\s*(?:iframe|embed|object)\b/i,
  /<!ENTITY/i,
  /<!DOCTYPE[^>]*\[/i,
  /\son[a-z]+\s*=/i,
  /javascript\s*:/i,
  /data\s*:\s*text\/html/i,
];

function svgMarkup(bytes: Uint8Array): string | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  // Skip the byte order mark, XML declaration, comments and doctype before the root element.
  const prologue = /^\uFEFF?\s*(?:<\?xml[^>]*\?>\s*)?(?:(?:<!--[\s\S]*?-->|<!DOCTYPE[^>[]*>)\s*)*/i.exec(text)?.[0] ?? "";
  const root = text.slice(prologue.length);
  if (!/^<svg[\s>]/.test(root) || !/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(root)) return null;
  return text;
}

/**
 * The image type of an uploaded logo, read from its bytes rather than the name
 * or type the browser sent, or null when it isn't a PNG, JPEG, WebP or a plain
 * SVG with no script in it.
 */
export function brandLogoContentType(bytes: Uint8Array): BrandLogoContentType | null {
  if (bytes.length === 0 || bytes.length > MAX_BRAND_LOGO_BYTES) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  const svg = svgMarkup(bytes);
  if (svg !== null && !UNSAFE_SVG_PATTERNS.some((pattern) => pattern.test(svg))) return "image/svg+xml";
  return null;
}
