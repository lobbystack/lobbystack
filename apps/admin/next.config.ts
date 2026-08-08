import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@lobbystack/config",
    "@lobbystack/contracts",
    "@lobbystack/db",
    "@lobbystack/domain",
    "@lobbystack/providers",
    "@lobbystack/shared",
    "@lobbystack/telemetry",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
