import { isIP } from "node:net";

function normalizeIpAddress(address: string): string {
  if (address.startsWith("::ffff:")) {
    return address.slice("::ffff:".length);
  }
  return address;
}

/** True for loopback, RFC1918, and common private IPv6 ranges. */
export function isPrivateNetworkAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }

  const normalized = normalizeIpAddress(address.trim());
  if (normalized === "::1" || normalized === "127.0.0.1") {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 6) {
    const lower = normalized.toLowerCase();
    // Unique local addresses: fc00::/7
    if (lower.startsWith("fc") || lower.startsWith("fd")) {
      return true;
    }
    // Link-local: fe80::/10
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
      return true;
    }
    // Loopback handled above; other IPv6 ranges are treated as public by default.
    return false;
  }
  if (ipVersion !== 4) {
    return false;
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
  // Link-local IPv4 (commonly used for host-local routing).
  if (first === 169 && second === 254) {
    return true;
  }

  return false;
}
