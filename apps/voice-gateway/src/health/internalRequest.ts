import { isIP } from "node:net";

function normalizeIpAddress(address: string): string {
  if (address.startsWith("::ffff:")) {
    return address.slice("::ffff:".length);
  }
  return address;
}

/** True for loopback and RFC1918 addresses (Docker bridge, host-local smoke checks). */
export function isPrivateNetworkAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }

  const normalized = normalizeIpAddress(address.trim());
  if (normalized === "::1" || normalized === "127.0.0.1") {
    return true;
  }

  if (isIP(normalized) !== 4) {
    return normalized === "::1";
  }

  const parts = normalized.split(".");
  if (parts.length !== 4) {
    return false;
  }
  const first = Number(parts[0]);
  const second = Number(parts[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return false;
  }
  if (first === 10) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }

  return false;
}
