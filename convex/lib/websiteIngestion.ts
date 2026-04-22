import {
  hasMeaningfulKnowledgeDocumentText,
  normalizeKnowledgeDocumentText,
} from "./knowledgeDocuments";

export const WEBSITE_INGESTION_PROVIDER = "cloudflare_browser_run";
export const WEBSITE_CRAWL_PAGE_LIMIT = 40;
export const WEBSITE_CRAWL_DEPTH = 3;
export const WEBSITE_CRAWL_HTTP_MODE = "http";
export const WEBSITE_CRAWL_BROWSER_MODE = "browser";

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

function buildCanonicalWebsiteUrl(parsed: URL): string {
  const pathname =
    parsed.pathname && parsed.pathname !== "/"
      ? parsed.pathname.replace(/\/+$/u, "")
      : "/";
  return pathname === "/" ? `${parsed.origin}/` : `${parsed.origin}${pathname}`;
}

export function normalizeWebsiteUrl(rawUrl: string): string {
  const parsed = new URL(ensureHttpProtocol(rawUrl));
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Enter a valid website URL that starts with http or https.");
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

  if (parsed.origin !== base.origin) {
    return null;
  }

  return buildCanonicalWebsiteUrl(parsed);
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

export function buildWebsiteCrawlIncludePatterns(websiteUrl: string): Array<string> {
  const { origin } = new URL(websiteUrl);
  return [`${origin}/**`];
}

export function buildWebsiteCrawlExcludePatterns(websiteUrl: string): Array<string> {
  const { origin } = new URL(websiteUrl);
  return [
    `${origin}/**/*account*`,
    `${origin}/**/*cart*`,
    `${origin}/**/*checkout*`,
    `${origin}/**/*legal*`,
    `${origin}/**/*login*`,
    `${origin}/**/*privacy*`,
    `${origin}/**/*search*`,
    `${origin}/**/*terms*`,
    `${origin}/**/*wp-admin*`,
    `${origin}/cdn-cgi/*`,
    `${origin}/**/feed*`,
  ];
}

export function countUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
