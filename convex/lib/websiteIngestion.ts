import {
  hasMeaningfulKnowledgeDocumentText,
  normalizeKnowledgeDocumentText,
} from "./knowledgeDocuments";

export const WEBSITE_INGESTION_PROVIDER = "cloudflare_browser_run";
export const WEBSITE_CRAWL_PAGE_LIMIT = 40;
export const WEBSITE_CRAWL_DEPTH = 3;
export const WEBSITE_CRAWL_HTTP_MODE = "http";
export const WEBSITE_CRAWL_BROWSER_MODE = "browser";
export const WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT = 12;
export const WEBSITE_CRAWL_BROWSER_FALLBACK_DEPTH = 2;
export const WEBSITE_CRAWL_PATTERN_LIMIT = 100;
export const WEBSITE_PUBLIC_URL_ERROR_MESSAGE =
  "Enter a public website URL. Localhost, local network addresses, and direct IP addresses are not supported. Use a tunnel URL for local testing.";

const IMPORTANT_PATH_SEGMENTS = new Set([
  "about",
  "booking",
  "book",
  "contact",
  "faq",
  "faqs",
  "hours",
  "location",
  "locations",
  "pricing",
  "price",
  "service",
  "services",
  "team",
]);

const LOW_SIGNAL_PATH_SEGMENTS = new Set([
  "account",
  "accounts",
  "cart",
  "checkout",
  "feed",
  "legal",
  "login",
  "privacy",
  "search",
  "sign-in",
  "signin",
  "terms",
  "wp-admin",
]);

const COMMON_SECOND_LEVEL_PUBLIC_SUFFIXES = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "gov",
  "net",
  "org",
]);

const LOW_SIGNAL_PREFIXES = ["/cdn-cgi/"];
const LOW_SIGNAL_EXTENSIONS =
  /\.(?:avif|bmp|css|csv|doc|docx|gif|ico|jpeg|jpg|js|json|map|mov|mp3|mp4|pdf|png|ppt|pptx|svg|ts|txt|webm|webp|woff|woff2|xls|xlsx|xml|zip)$/iu;

function ensureHttpProtocol(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (/^[a-z]+:\/\//iu.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function buildCanonicalWebsiteUrl(
  parsed: URL,
  options?: {
    origin?: string;
  },
): string {
  const origin = options?.origin ?? parsed.origin;
  const pathname =
    parsed.pathname && parsed.pathname !== "/"
      ? parsed.pathname.replace(/\/+$/u, "")
      : "/";
  return pathname === "/" ? `${origin}/` : `${origin}${pathname}`;
}

function buildComparableHostname(hostname: string): string {
  return hostname.replace(/^www\./u, "").toLowerCase();
}

function normalizeWebsiteHostname(hostname: string): string {
  return hostname.replace(/\.$/u, "").toLowerCase();
}

function supportsApexAndWwwEquivalence(hostname: string): boolean {
  const normalizedHostname = normalizeWebsiteHostname(hostname);
  const comparableHostname = buildComparableHostname(normalizedHostname);
  const labels = comparableHostname.split(".");

  if (normalizedHostname === "localhost" || isIpLikeHostname(normalizedHostname)) {
    return false;
  }

  if (labels.length === 2) {
    return true;
  }

  if (
    labels.length === 3 &&
    labels[2]?.length === 2 &&
    labels[1] &&
    COMMON_SECOND_LEVEL_PUBLIC_SUFFIXES.has(labels[1])
  ) {
    return true;
  }

  return false;
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

export function isIpLikeHostname(hostname: string): boolean {
  const normalizedHostname = stripIpv6Brackets(normalizeWebsiteHostname(hostname));
  return /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(normalizedHostname) || normalizedHostname.includes(":");
}

export function isDirectlyBlockedWebsiteHostname(hostname: string): boolean {
  const normalizedHostname = normalizeWebsiteHostname(hostname);
  return (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".local") ||
    normalizedHostname.endsWith(".localdomain") ||
    normalizedHostname.endsWith(".home.arpa") ||
    isIpLikeHostname(normalizedHostname)
  );
}

export function normalizeWebsiteUrl(rawUrl: string): string {
  const parsed = new URL(ensureHttpProtocol(rawUrl));
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Enter a valid website URL that starts with http or https.");
  }
  if (isDirectlyBlockedWebsiteHostname(parsed.hostname)) {
    throw new Error(WEBSITE_PUBLIC_URL_ERROR_MESSAGE);
  }

  return buildCanonicalWebsiteUrl(parsed);
}

export function normalizeWebsitePageUrl(rawUrl: string, websiteUrl: string): string | null {
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(rawUrl, websiteUrl);
    base = new URL(websiteUrl);
  } catch {
    return null;
  }

  const normalizedParsedHostname = normalizeWebsiteHostname(parsed.hostname);
  const normalizedBaseHostname = normalizeWebsiteHostname(base.hostname);
  const hostnamesMatchDirectly = normalizedParsedHostname === normalizedBaseHostname;
  const hostnamesMatchViaApexAndWww =
    supportsApexAndWwwEquivalence(base.hostname) &&
    buildComparableHostname(parsed.hostname) === buildComparableHostname(base.hostname);

  if ((!hostnamesMatchDirectly && !hostnamesMatchViaApexAndWww) || parsed.port !== base.port) {
    return null;
  }

  const normalizedBasePath =
    base.pathname && base.pathname !== "/" ? base.pathname.replace(/\/+$/u, "") : "/";
  const normalizedPagePath =
    parsed.pathname && parsed.pathname !== "/" ? parsed.pathname.replace(/\/+$/u, "") : "/";

  if (
    normalizedBasePath !== "/" &&
    normalizedPagePath !== normalizedBasePath &&
    !normalizedPagePath.startsWith(`${normalizedBasePath}/`)
  ) {
    return null;
  }

  return buildCanonicalWebsiteUrl(parsed, { origin: base.origin });
}

export function normalizeWebsiteMarkdown(markdown: string): string {
  return normalizeKnowledgeDocumentText(markdown)
    .replace(/^\s*Skip to content\s*$/imu, "")
    .trim();
}

export function isImportantWebsitePath(pageUrl: string): boolean {
  const pathname = new URL(pageUrl).pathname.toLowerCase();
  const segments = pathname.split("/").filter(Boolean);
  return segments.some((segment) => IMPORTANT_PATH_SEGMENTS.has(segment));
}

export function shouldSkipWebsitePage(pageUrl: string): boolean {
  const parsed = new URL(pageUrl);
  const pathname = parsed.pathname.toLowerCase();
  if (LOW_SIGNAL_EXTENSIONS.test(pathname)) {
    return true;
  }

  if (LOW_SIGNAL_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }

  return pathname
    .split("/")
    .filter(Boolean)
    .some((segment) => LOW_SIGNAL_PATH_SEGMENTS.has(segment));
}

export function shouldImportWebsitePage(input: {
  pageUrl: string;
  markdown: string;
}): boolean {
  if (shouldSkipWebsitePage(input.pageUrl)) {
    return false;
  }

  const normalizedMarkdown = normalizeWebsiteMarkdown(input.markdown);
  if (!hasMeaningfulKnowledgeDocumentText(normalizedMarkdown)) {
    return false;
  }

  const normalizedLength = normalizedMarkdown.replace(/\s+/gu, " ").trim().length;
  if (isImportantWebsitePath(input.pageUrl)) {
    return normalizedLength >= 80;
  }

  return normalizedLength >= 250;
}

export function computeWebsiteDocumentImportance(pageUrl: string): number {
  return isImportantWebsitePath(pageUrl) ? 85 : 75;
}

export function shouldTriggerBrowserFallback(input: {
  importedPageCount: number;
  totalMarkdownBytes: number;
}): boolean {
  return (
    input.importedPageCount === 0 ||
    (input.importedPageCount < 3 && input.totalMarkdownBytes < 4 * 1024)
  );
}

export function resolveWebsiteCrawlBudget(input: {
  render: boolean;
  pageLimit?: number | null;
  depth?: number | null;
}): { pageLimit: number; depth: number } {
  const requestedPageLimit = input.pageLimit ?? WEBSITE_CRAWL_PAGE_LIMIT;
  const requestedDepth = input.depth ?? WEBSITE_CRAWL_DEPTH;

  if (!input.render) {
    return {
      pageLimit: requestedPageLimit,
      depth: requestedDepth,
    };
  }

  return {
    pageLimit: Math.min(requestedPageLimit, WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT),
    depth: Math.min(requestedDepth, WEBSITE_CRAWL_BROWSER_FALLBACK_DEPTH),
  };
}

function buildEquivalentWebsiteUrls(websiteUrl: string): Array<string> {
  const canonicalWebsiteUrl = normalizeWebsiteUrl(websiteUrl);
  const parsed = new URL(canonicalWebsiteUrl);

  if (!supportsApexAndWwwEquivalence(parsed.hostname)) {
    return [canonicalWebsiteUrl];
  }

  const alternate = new URL(canonicalWebsiteUrl);
  alternate.hostname = parsed.hostname.startsWith("www.")
    ? parsed.hostname.slice(4)
    : `www.${parsed.hostname}`;
  const alternateWebsiteUrl = buildCanonicalWebsiteUrl(alternate);

  if (alternateWebsiteUrl === canonicalWebsiteUrl) {
    return [canonicalWebsiteUrl];
  }

  return [canonicalWebsiteUrl, alternateWebsiteUrl];
}

function buildExactSegmentExcludePatterns(
  excludeBase: string,
  pathSegment: string,
): Array<string> {
  return [
    `${excludeBase}/${pathSegment}`,
    `${excludeBase}/${pathSegment}/**`,
    `${excludeBase}/**/${pathSegment}`,
    `${excludeBase}/**/${pathSegment}/**`,
  ];
}

export function buildWebsiteCrawlIncludePatterns(websiteUrl: string): Array<string> {
  return Array.from(
    new Set(
      buildEquivalentWebsiteUrls(websiteUrl).flatMap((candidateWebsiteUrl) => [
        candidateWebsiteUrl,
        candidateWebsiteUrl.endsWith("/")
          ? `${candidateWebsiteUrl}**`
          : `${candidateWebsiteUrl}/**`,
      ]),
    ),
  );
}

export function buildWebsiteCrawlExcludePatterns(websiteUrl: string): Array<string> {
  const patterns = new Set<string>();

  for (const candidateWebsiteUrl of buildEquivalentWebsiteUrls(websiteUrl)) {
    const excludeBase = candidateWebsiteUrl.endsWith("/")
      ? candidateWebsiteUrl.slice(0, -1)
      : candidateWebsiteUrl;

    const candidatePatterns = [
      ...buildExactSegmentExcludePatterns(excludeBase, "account"),
      ...buildExactSegmentExcludePatterns(excludeBase, "accounts"),
      ...buildExactSegmentExcludePatterns(excludeBase, "cart"),
      ...buildExactSegmentExcludePatterns(excludeBase, "checkout"),
      ...buildExactSegmentExcludePatterns(excludeBase, "feed"),
      ...buildExactSegmentExcludePatterns(excludeBase, "legal"),
      ...buildExactSegmentExcludePatterns(excludeBase, "login"),
      ...buildExactSegmentExcludePatterns(excludeBase, "privacy"),
      ...buildExactSegmentExcludePatterns(excludeBase, "search"),
      ...buildExactSegmentExcludePatterns(excludeBase, "sign-in"),
      ...buildExactSegmentExcludePatterns(excludeBase, "signin"),
      ...buildExactSegmentExcludePatterns(excludeBase, "terms"),
      ...buildExactSegmentExcludePatterns(excludeBase, "wp-admin"),
      `${excludeBase}/cdn-cgi/*`,
    ];

    if (patterns.size + candidatePatterns.length > WEBSITE_CRAWL_PATTERN_LIMIT) {
      break;
    }

    for (const pattern of candidatePatterns) {
      patterns.add(pattern);
    }
  }

  return Array.from(patterns);
}

export function countUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
