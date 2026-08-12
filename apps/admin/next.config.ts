import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@lobbystack/ai",
    "@lobbystack/config",
    "@lobbystack/contracts",
    "@lobbystack/db",
    "@lobbystack/domain",
    "@lobbystack/providers",
    "@lobbystack/shared",
  ],
  serverExternalPackages: [
    "@lobbystack/telemetry/node",
    "@opentelemetry/sdk-node",
    "@opentelemetry/exporter-logs-otlp-grpc",
    "@grpc/grpc-js",
  ],
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
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://*.posthog.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://challenges.cloudflare.com https://*.posthog.com wss:",
      "frame-src 'self' https://challenges.cloudflare.com",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
    ].join("; ");
    return [{ source: "/(.*)", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }, { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, { key: "X-Frame-Options", value: "DENY" }] }];
  },
};

export default nextConfig;
