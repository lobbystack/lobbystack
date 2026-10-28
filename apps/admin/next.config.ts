import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";
import { partnerFeatures } from "@lobbystack/shared";

import { resolve } from "node:path";

import { publicAssetVersion } from "./asset-version";
import { releaseVersion } from "./src/lib/release-version";
import { brandLogoSecurityHeaders, embeddableSecurityHeaders, securityHeaders, toNextHeaderList } from "./security-headers";

// One release identifies the build everywhere: browser error reports, the source
// maps uploaded to PostHog, and the deployment ID below.
const serviceVersion = releaseVersion();

/** Partners' subdomains, as an allowedDevOrigins pattern, when partnerFeatures accepts the base domain. */
function partnerBaseDomainOrigins(): string | undefined {
  const { baseDomain } = partnerFeatures(process.env);
  return baseDomain ? `*.${baseDomain}` : undefined;
}

const nextConfig: NextConfig = {
  // PostHog's source map step writes the release ID into each JS chunk after
  // Turbopack has named it, so a chunk that did not change keeps its URL while
  // its bytes change. Browsers cache those URLs as immutable and kept running
  // chunks stamped with an old release. The deployment ID adds `?dpl=` to every
  // asset URL, so each deploy's chunks are fetched fresh.
  ...(serviceVersion === "development" ? {} : { deploymentId: serviceVersion }),
  // Extra hosts (e.g. an ngrok tunnel) that may load dev-only resources such as HMR.
  // The marketing hosts (lobbystack.localhost in development) count as extra hosts too,
  // and so do partners' subdomains of the partner base domain (partners.localhost in development).
  allowedDevOrigins: [process.env.ALLOWED_DEV_ORIGINS, process.env.MARKETING_HOSTS, partnerBaseDomainOrigins()]
    .flatMap((hosts) => (hosts ?? "").split(","))
    .map((host) => host.trim())
    .filter(Boolean),
  experimental: {
    preloadEntriesOnStart: false,
    requestInsights: process.env.NODE_ENV === "development",
  },
  // Most admin routes are intentionally dynamic and the deployment has one
  // long-lived instance. Avoid retaining Next.js' default 50 MB response cache
  // in addition to the durable application caches in Postgres and Redis.
  cacheMaxMemorySize: 0,
  env: {
    NEXT_PUBLIC_SERVICE_VERSION: serviceVersion,
    // Keys the immutable `?v=` asset URLs to the files' content, not to a
    // deployment variable that can stay unchanged across deploys.
    NEXT_PUBLIC_ASSET_VERSION: publicAssetVersion(resolve(process.cwd(), "public"), serviceVersion),
    NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV ?? "development",
    // Where the dashboard's outside links go (packages/shared/src/brandLinks.ts),
    // fixed at build even when unset, so a value set only at run time can't make
    // the server render a link the browser then disagrees with.
    NEXT_PUBLIC_LANDING_SITE_URL: process.env.NEXT_PUBLIC_LANDING_SITE_URL ?? "",
    NEXT_PUBLIC_TERMS_URL: process.env.NEXT_PUBLIC_TERMS_URL ?? "",
    NEXT_PUBLIC_PRIVACY_URL: process.env.NEXT_PUBLIC_PRIVACY_URL ?? "",
    NEXT_PUBLIC_DOCS_SITE_URL: process.env.NEXT_PUBLIC_DOCS_SITE_URL ?? "",
    NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
    // The marketing site's sign-in links and voice demo. Its pages and islands
    // are prerendered, so these are fixed at build like the links above.
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "",
    NEXT_PUBLIC_LIVE_CALL_ENDPOINT: process.env.NEXT_PUBLIC_LIVE_CALL_ENDPOINT ?? "",
    NEXT_PUBLIC_WEB_CALL_BUSINESS_SLUG: process.env.NEXT_PUBLIC_WEB_CALL_BUSINESS_SLUG ?? "",
    // Whether the build includes the marketing site (src/marketing/build.ts).
    // Dockerfile.admin sets MARKETING_SITE=false unless a release asks for it.
    MARKETING_SITE_BUILT: process.env.MARKETING_SITE === "false" ? "false" : "true",
    // No NEXT_PUBLIC_DEPLOYMENT_MODE: browser telemetry gets the mode from the
    // server at runtime (src/lib/deployment-mode.ts).
  },
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": ["./.next/dev/**/*", "./.next/cache/**/*", "./.next/standalone/**/*"],
  },
  outputFileTracingIncludes: {
    "/*": ["../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*"],
  },
  transpilePackages: [
    "@lobbystack/agent-core",
    "@lobbystack/contracts",
    "@lobbystack/db",
    "@lobbystack/domain",
    "@lobbystack/jobs",
    "@lobbystack/providers",
    "@lobbystack/shared",
    "@lobbystack/web-voice",
  ],
  serverExternalPackages: process.env.NODE_ENV === "production"
    ? [
        "@lobbystack/telemetry/node",
        "@opentelemetry/sdk-node",
        "@opentelemetry/exporter-logs-otlp-grpc",
        "@grpc/grpc-js",
      ]
    : [],
  turbopack: {
    resolveAlias: {
      "@lobbystack/telemetry": "../../packages/telemetry/dist/index.js",
      "@lobbystack/telemetry/node": "../../packages/telemetry/dist/node.js",
      "@lobbystack/telemetry/browser": "../../packages/telemetry/dist/browser.js",
    },
  },
  poweredByHeader: false,
  // The proxy owns trailing slashes: marketing pages keep them, dashboard and API paths drop them.
  skipTrailingSlashRedirect: true,
  async headers() {
    // The iframe document routes own their own framing policy: the global DENY
    // header must not be stamped on top of the embeddable CSP.
    const embeddable = toNextHeaderList(embeddableSecurityHeaders());
    const immutableAssetCache = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
    const embedLoaderCache = [{ key: "Cache-Control", value: "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" }];
    // A loader for one key carries the bubble look saved in the dashboard, so edits must reach websites quickly.
    const keyedEmbedLoaderCache = [{ key: "Cache-Control", value: "public, max-age=60, s-maxage=60" }];
    return [
      { source: "/locales/:path*", headers: immutableAssetCache },
      { source: "/brand/:path*", headers: immutableAssetCache },
      { source: "/lobbystack-logo.svg", headers: immutableAssetCache },
      { source: "/embed/embed.js", headers: immutableAssetCache },
      { source: "/((?!embed\\.js|embed/|api/branding/logo$).*)", headers: toNextHeaderList(securityHeaders()) },
      { source: "/api/branding/logo", headers: toNextHeaderList(brandLogoSecurityHeaders()) },
      { source: "/embed.js", missing: [{ type: "query", key: "key" }], headers: [...embeddable, ...embedLoaderCache] },
      { source: "/embed.js", has: [{ type: "query", key: "key" }], headers: [...embeddable, ...keyedEmbedLoaderCache] },
      { source: "/embed/:key*", headers: embeddable },
    ];
  },
  async redirects() {
    // The widget page moved out of Settings; keep old bookmarks and alert links working.
    // The partner console's Stripe page is Payments now; Stripe's onboarding links may still return to the old address.
    // Connected apps moved to the bottom of API keys as MCP connections; the consent page and docs used to link the old tab.
    return [
      { source: "/settings/widget", destination: "/widget", permanent: true },
      { source: "/settings/connected-apps", destination: "/settings/api-keys", permanent: true },
      { source: "/partner/:partnerId/stripe", destination: "/partner/:partnerId/payments", permanent: true },
    ];
  },
};

export default process.env.POSTHOG_SOURCEMAP_API_KEY
  ? withPostHogConfig(nextConfig, {
      personalApiKey: process.env.POSTHOG_SOURCEMAP_API_KEY,
      projectId: process.env.POSTHOG_PROJECT_ID ?? "266281",
      host: "https://us.posthog.com",
      sourcemaps: { enabled: true, releaseName: "lobbystack-admin", releaseVersion: serviceVersion, deleteAfterUpload: true },
    })
  : nextConfig;
