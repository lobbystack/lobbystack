import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";

import { resolve } from "node:path";

import { publicAssetVersion } from "./asset-version";
import { releaseVersion } from "./src/lib/release-version";
import { embeddableSecurityHeaders, securityHeaders, toNextHeaderList } from "./security-headers";

// One release identifies the build everywhere: browser error reports, the source
// maps uploaded to PostHog, and the deployment ID below.
const serviceVersion = releaseVersion();

const nextConfig: NextConfig = {
  // PostHog's source map step writes the release ID into each JS chunk after
  // Turbopack has named it, so a chunk that did not change keeps its URL while
  // its bytes change. Browsers cache those URLs as immutable and kept running
  // chunks stamped with an old release. The deployment ID adds `?dpl=` to every
  // asset URL, so each deploy's chunks are fetched fresh.
  ...(serviceVersion === "development" ? {} : { deploymentId: serviceVersion }),
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
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        { "@lobbystack/telemetry/node": "commonjs @lobbystack/telemetry/node" },
      ];
    }
    return config;
  },
  poweredByHeader: false,
  async headers() {
    // The iframe document routes own their own framing policy: the global DENY
    // header must not be stamped on top of the embeddable CSP.
    const embeddable = toNextHeaderList(embeddableSecurityHeaders());
    const immutableAssetCache = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
    const embedLoaderCache = [{ key: "Cache-Control", value: "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" }];
    return [
      { source: "/locales/:path*", headers: immutableAssetCache },
      { source: "/brand/:path*", headers: immutableAssetCache },
      { source: "/lobbystack-logo.svg", headers: immutableAssetCache },
      { source: "/embed/embed.js", headers: immutableAssetCache },
      { source: "/((?!embed\\.js|embed/).*)", headers: toNextHeaderList(securityHeaders()) },
      { source: "/embed.js", headers: [...embeddable, ...embedLoaderCache] },
      { source: "/embed/:key*", headers: embeddable },
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
