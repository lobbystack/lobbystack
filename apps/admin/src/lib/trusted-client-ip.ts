// Re-exported from the server-only config package so every runtime
// derives client identity the same way.
export {
  TRUSTED_CLIENT_IP_HEADERS,
  UNATTRIBUTABLE_CLIENT_IP,
  normalizeTrustedClientIp,
  resolveTrustedClientIp,
  resolveTrustedClientIpKey,
  trustedClientIp,
  trustedClientIpFromHeaders,
  trustedClientIpHeader,
  warnTrustedClientIpUnconfigured,
} from "@lobbystack/config";
export type {
  TrustedClientIpHeader,
  TrustedClientIpResolution,
} from "@lobbystack/config";
