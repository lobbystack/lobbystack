// Single-sourced with the voice gateway through the server-only config
// package so admin and gateway always derive client identity identically.
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
