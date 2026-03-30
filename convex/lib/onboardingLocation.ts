import { resolveNumberSuggestionContext, type NumberSuggestionContext } from "./onboardingPhoneNumbers";

type IpInfoGeoResponse = {
  city?: string;
  region?: string;
  region_code?: string;
  country?: string;
  country_code?: string;
  timezone?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
};

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

async function lookupIpInfoGeo(ipAddress: string): Promise<IpInfoGeoResponse | null> {
  const token = process.env.IPINFO_TOKEN;
  if (!token) {
    return null;
  }

  const url = new URL(`https://api.ipinfo.io/lookup/${ipAddress}/geo`);
  url.searchParams.set("token", token);

  const response = await fetch(url.toString());
  if (!response.ok) {
    return null;
  }

  return (await response.json()) as IpInfoGeoResponse;
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

  const ipAddress = extractClientIpAddress(input.request);
  if (ipAddress) {
    try {
      const geo = await lookupIpInfoGeo(ipAddress);
      if (geo) {
        return resolveNumberSuggestionContext({
          ...(geo.country_code || geo.country ? { countryCode: geo.country_code ?? geo.country } : {}),
          ...(geo.region_code || geo.region ? { regionCode: geo.region_code ?? geo.region } : {}),
          ...(geo.city ? { city: geo.city } : {}),
          ...(geo.postal_code ? { postalCode: geo.postal_code } : {}),
          ...(geo.timezone || input.timezoneHint
            ? { timezone: geo.timezone ?? input.timezoneHint }
            : {}),
          ...(geo.latitude !== undefined ? { latitude: geo.latitude } : {}),
          ...(geo.longitude !== undefined ? { longitude: geo.longitude } : {}),
          source: "ipinfo",
        });
      }
    } catch {
      // Fall through to timezone/default inference below.
    }
  }

  return resolveNumberSuggestionContext({
    ...(input.timezoneHint ? { timezone: input.timezoneHint } : {}),
    source: input.timezoneHint ? "timezone" : "default",
  });
}
