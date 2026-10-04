import { BlockList, isIP } from "node:net";
import { lookup } from "node:dns/promises";

type Resolver = (hostname: string) => Promise<Array<{ address: string }>>;

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including cloud metadata at 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved and broadcast
] as const) blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["::", 96], // IPv4-compatible (deprecated)
  ["64:ff9b::", 96], // NAT64; the embedded IPv4 address is checked separately too
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard
  ["2001::", 23], // IETF protocol assignments
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique local, including fd00:ec2::254 (AWS metadata)
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const) blocked.addSubnet(network, prefix, "ipv6");

function embeddedIpv4(address: string): string | null {
  const lower = address.toLowerCase();
  const mapped = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1]) return mapped[1];
  // ::ffff:7f00:1 style IPv4-mapped addresses.
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex?.[1] && hex[2]) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return null;
}

/** True when an IP address is private, loopback, link-local, metadata, or otherwise not public. */
export function isBlockedAddress(address: string): boolean {
  const unbracketed = address.replace(/^\[|\]$/g, "");
  const family = isIP(unbracketed);
  if (family === 4) return blocked.check(unbracketed, "ipv4");
  if (family === 6) {
    const v4 = embeddedIpv4(unbracketed);
    if (v4) return blocked.check(v4, "ipv4");
    return blocked.check(unbracketed, "ipv6");
  }
  return true;
}

const defaultResolver: Resolver = async (hostname) => await lookup(hostname, { all: true, verbatim: true });

export async function assertPublicHttpUrl(value: string, resolver: Resolver = defaultResolver): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Website URL must use HTTP or HTTPS.");
  if (url.username || url.password) throw new Error("Website URL must not include credentials.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error("Website URL must resolve to a public address.");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await resolver(hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) throw new Error("Website URL must resolve to a public address.");
  return url;
}
