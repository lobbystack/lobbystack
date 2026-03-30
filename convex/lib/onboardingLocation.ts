import { resolveNumberSuggestionContext, type NumberSuggestionContext } from "./onboardingPhoneNumbers";

type CloudflareGeoHeaders = {
  city?: string;
  regionCode?: string;
  countryCode?: string;
  postalCode?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
};

function parseOptionalNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractCloudflareGeoHeaders(request: Request): CloudflareGeoHeaders | null {
  const countryCode = request.headers.get("cf-ipcountry")?.trim() || undefined;
  const regionCode = request.headers.get("cf-region-code")?.trim() || undefined;
  const city = request.headers.get("cf-ipcity")?.trim() || undefined;
  const postalCode = request.headers.get("cf-postal-code")?.trim() || undefined;
  const timezone = request.headers.get("cf-timezone")?.trim() || undefined;
  const latitude = parseOptionalNumber(request.headers.get("cf-iplatitude"));
  const longitude = parseOptionalNumber(request.headers.get("cf-iplongitude"));

  if (
    !countryCode &&
    !regionCode &&
    !city &&
    !postalCode &&
    timezone === undefined &&
    latitude === undefined &&
    longitude === undefined
  ) {
    return null;
  }

  return {
    ...(countryCode ? { countryCode } : {}),
    ...(regionCode ? { regionCode } : {}),
    ...(city ? { city } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(timezone ? { timezone } : {}),
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
  };
}

function isPublicIpAddress(value: string): boolean {
  if (!value) {
    return false;
  }

  const ipv4Match = value.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const firstOctet = Number.parseInt(ipv4Match[1]!, 10);
    const secondOctet = Number.parseInt(ipv4Match[2]!, 10);

    if (
      firstOctet === 10 ||
      firstOctet === 127 ||
      (firstOctet === 192 && secondOctet === 168) ||
      (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31)
    ) {
      return false;
    }
  }

  if (
    value === "::1" ||
    value.toLowerCase().startsWith("fe80:") ||
    value.toLowerCase().startsWith("fc") ||
    value.toLowerCase().startsWith("fd")
  ) {
    return false;
  }

  return true;
}

export function extractClientIpAddress(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cloudflareIp = request.headers.get("cf-connecting-ip");

  const candidates = [
    ...(forwardedFor?.split(",").map((value) => value.trim()) ?? []),
    ...(realIp ? [realIp.trim()] : []),
    ...(cloudflareIp ? [cloudflareIp.trim()] : []),
  ];

  return candidates.find(isPublicIpAddress) ?? null;
}

export async function inferOnboardingLocationContext(input: {
  request: Request;
  timezoneHint?: string;
}): Promise<NumberSuggestionContext> {
  const cloudflareGeo = extractCloudflareGeoHeaders(input.request);
  if (cloudflareGeo) {
    return resolveNumberSuggestionContext({
      ...cloudflareGeo,
      ...(cloudflareGeo.timezone || input.timezoneHint
        ? { timezone: cloudflareGeo.timezone ?? input.timezoneHint }
        : {}),
      source: "cloudflare",
    });
  }

  return resolveNumberSuggestionContext({
    ...(input.timezoneHint ? { timezone: input.timezoneHint } : {}),
    source: input.timezoneHint ? "timezone" : "default",
  });
}
