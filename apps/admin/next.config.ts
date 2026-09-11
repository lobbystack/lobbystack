import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";

import { embeddableSecurityHeaders, securityHeaders, toNextHeaderList } from "./security-headers";

const nextConfig: NextConfig = {
  experimental: { requestInsights: process.env.NODE_ENV === "development" },
  env: {
    NEXT_PUBLIC_SERVICE_VERSION: process.env.RAILWAY_DEPLOYMENT_ID ?? process.env.SERVICE_VERSION ?? "development",
    NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV ?? "development",
  },
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": ["./.next/dev/**/*", "./.next/cache/**/*", "./.next/standalone/**/*"],
  },
  transpilePackages: [
    "@lobbystack/ai",
    "@lobbystack/config",
    "@lobbystack/contracts",
    "@lobbystack/db",
    "@lobbystack/domain",
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
    return [
      { source: "/((?!embed\\.js|embed/).*)", headers: toNextHeaderList(securityHeaders()) },
      { source: "/embed.js", headers: embeddable },
      { source: "/embed/:key*", headers: embeddable },
    ];
  },
};

export default process.env.POSTHOG_SOURCEMAP_API_KEY
  ? withPostHogConfig(nextConfig, {
      personalApiKey: process.env.POSTHOG_SOURCEMAP_API_KEY,
      projectId: process.env.POSTHOG_PROJECT_ID ?? "266281",
      host: "https://us.posthog.com",
      sourcemaps: { enabled: true, releaseName: "lobbystack-admin", releaseVersion: process.env.RAILWAY_DEPLOYMENT_ID ?? process.env.SERVICE_VERSION ?? "development", deleteAfterUpload: true },
    })
  : nextConfig;
