import { v } from "convex/values";

export const locationSourceValidator = v.union(
  v.literal("cloudflare"),
  v.literal("timezone"),
  v.literal("default"),
);

export const numberSuggestionContextValidator = v.object({
  countryCode: v.string(),
  regionCode: v.optional(v.string()),
  city: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  metroKey: v.optional(v.string()),
  confidence: v.number(),
  source: locationSourceValidator,
  timezone: v.optional(v.string()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
});

export type NumberSuggestionContext = {
  countryCode: string;
  regionCode?: string;
  city?: string;
  postalCode?: string;
  metroKey?: string;
  confidence: number;
  source: "cloudflare" | "timezone" | "default";
  timezone?: string;
  latitude?: number;
  longitude?: number;
};

export const searchModeValidator = v.union(
  v.literal("suggested"),
  v.literal("city"),
  v.literal("area_code"),
  v.literal("toll_free"),
);

export const numberSelectionContextValidator = v.object({
  mode: searchModeValidator,
  countryCode: v.string(),
  regionCode: v.optional(v.string()),
  city: v.optional(v.string()),
  areaCode: v.optional(v.string()),
  metroKey: v.optional(v.string()),
});

export type NumberSelectionContext = {
  mode: "suggested" | "city" | "area_code" | "toll_free";
  countryCode: string;
  regionCode?: string;
  city?: string;
  areaCode?: string;
  metroKey?: string;
};

export const availableNumberSummaryValidator = v.object({
  e164: v.string(),
  display: v.string(),
  locality: v.optional(v.string()),
  region: v.optional(v.string()),
  countryCode: v.string(),
  kind: v.union(v.literal("local"), v.literal("toll_free")),
  capabilities: v.object({
    sms: v.boolean(),
    voice: v.boolean(),
  }),
  selectionContext: numberSelectionContextValidator,
});

export type AvailableNumberSummary = {
  e164: string;
  display: string;
  locality?: string;
  region?: string;
  countryCode: string;
  kind: "local" | "toll_free";
  capabilities: {
    sms: boolean;
    voice: boolean;
  };
  selectionContext: NumberSelectionContext;
};

type MetroDefinition = {
  key: string;
  countryCode: string;
  regionCode: string;
  areaCodes: string[];
  latitude: number;
  longitude: number;
  localityAliases: string[];
};

const canadianMetros: MetroDefinition[] = [
  {
    key: "quebec_city",
    countryCode: "CA",
    regionCode: "QC",
    areaCodes: ["418", "581", "367"],
    latitude: 46.8139,
    longitude: -71.208,
    localityAliases: [
      "quebec city",
      "quebec",
      "levis",
      "saint nicolas",
      "st nicolas",
      "saint nicolas de levis",
      "sainte foy",
      "ste foy",
    ],
  },
  {
    key: "montreal",
    countryCode: "CA",
    regionCode: "QC",
    areaCodes: ["514", "438", "263"],
    latitude: 45.5019,
    longitude: -73.5674,
    localityAliases: ["montreal", "westmount", "verdun", "outremont", "saint laurent"],
  },
  {
    key: "south_shore",
    countryCode: "CA",
    regionCode: "QC",
    areaCodes: ["450", "579", "354"],
    latitude: 45.5312,
    longitude: -73.5181,
    localityAliases: [
      "longueuil",
      "boucherville",
      "brossard",
      "saint lambert",
      "terrebonne",
      "chambly",
      "varennes",
      "laval",
    ],
  },
  {
    key: "central_west_qc",
    countryCode: "CA",
    regionCode: "QC",
    areaCodes: ["819", "873", "468"],
    latitude: 45.4042,
    longitude: -71.8929,
    localityAliases: ["gatineau", "sherbrooke", "trois rivieres", "drummondville"],
  },
  {
    key: "toronto",
    countryCode: "CA",
    regionCode: "ON",
    areaCodes: ["416", "647", "437"],
    latitude: 43.6532,
    longitude: -79.3832,
    localityAliases: ["toronto", "north york", "scarborough", "etobicoke"],
  },
  {
    key: "vancouver",
    countryCode: "CA",
    regionCode: "BC",
    areaCodes: ["604", "778", "236", "672"],
    latitude: 49.2827,
    longitude: -123.1207,
    localityAliases: ["vancouver", "burnaby", "surrey", "richmond", "new westminster"],
  },
  {
    key: "calgary",
    countryCode: "CA",
    regionCode: "AB",
    areaCodes: ["403", "587", "368", "825"],
    latitude: 51.0447,
    longitude: -114.0719,
    localityAliases: ["calgary", "airdrie", "okotoks"],
  },
  {
    key: "halifax",
    countryCode: "CA",
    regionCode: "NS",
    areaCodes: ["902", "782"],
    latitude: 44.6488,
    longitude: -63.5752,
    localityAliases: ["halifax", "dartmouth", "bedford"],
  },
];

const provinceDefaultMetroByRegionCode: Record<string, string> = {
  AB: "calgary",
  BC: "vancouver",
  NS: "halifax",
  ON: "toronto",
  QC: "montreal",
};

function normalizeCityName(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeRegionCode(value: string | undefined | null): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : undefined;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const earthRadiusKm = 6371;
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const normalizedLatitudeA = toRadians(latitudeA);
  const normalizedLatitudeB = toRadians(latitudeB);

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(normalizedLatitudeA) *
      Math.cos(normalizedLatitudeB) *
      Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function findMetroByKey(key: string | undefined): MetroDefinition | null {
  if (!key) {
    return null;
  }
  return canadianMetros.find((metro) => metro.key === key) ?? null;
}

function resolveMetroByLocality(input: {
  city?: string;
  regionCode?: string;
}): MetroDefinition | null {
  const normalizedCity = normalizeCityName(input.city);
  const normalizedRegionCode = normalizeRegionCode(input.regionCode);
  if (!normalizedCity) {
    return null;
  }

  return (
    canadianMetros.find((metro) => {
      if (normalizedRegionCode && metro.regionCode !== normalizedRegionCode) {
        return false;
      }

      return metro.localityAliases.includes(normalizedCity);
    }) ?? null
  );
}

function resolveNearestMetro(input: {
  countryCode: string;
  regionCode?: string;
  latitude?: number;
  longitude?: number;
}): MetroDefinition | null {
  if (input.latitude === undefined || input.longitude === undefined) {
    return null;
  }

  const normalizedRegionCode = normalizeRegionCode(input.regionCode);
  const candidates = canadianMetros.filter((metro) => {
    if (metro.countryCode !== input.countryCode) {
      return false;
    }

    if (normalizedRegionCode && metro.regionCode !== normalizedRegionCode) {
      return false;
    }

    return true;
  });

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((best, candidate) => {
    const bestDistance = calculateDistanceKm(
      input.latitude!,
      input.longitude!,
      best.latitude,
      best.longitude,
    );
    const candidateDistance = calculateDistanceKm(
      input.latitude!,
      input.longitude!,
      candidate.latitude,
      candidate.longitude,
    );
    return candidateDistance < bestDistance ? candidate : best;
  });
}

function inferCountryCodeFromTimezone(timezone: string | undefined): string | undefined {
  if (!timezone) {
    return undefined;
  }

  if (
    [
      "America/Toronto",
      "America/Montreal",
      "America/Vancouver",
      "America/Halifax",
      "America/Edmonton",
      "America/Winnipeg",
      "America/St_Johns",
      "America/Regina",
    ].includes(timezone)
  ) {
    return "CA";
  }

  return undefined;
}

export function resolveNumberSuggestionContext(input: {
  countryCode?: string | null;
  regionCode?: string | null;
  city?: string | null;
  postalCode?: string | null;
  timezone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: NumberSuggestionContext["source"];
}): NumberSuggestionContext {
  const countryCode =
    input.countryCode?.trim().toUpperCase() ??
    inferCountryCodeFromTimezone(input.timezone ?? undefined) ??
    "CA";
  const regionCode = normalizeRegionCode(input.regionCode);
  const city = input.city?.trim() || undefined;
  const postalCode = input.postalCode?.trim() || undefined;
  const timezone = input.timezone?.trim() || undefined;
  const latitude = input.latitude ?? undefined;
  const longitude = input.longitude ?? undefined;

  const metro =
    resolveMetroByLocality({
      ...(city ? { city } : {}),
      ...(regionCode ? { regionCode } : {}),
    }) ??
    resolveNearestMetro({
      countryCode,
      ...(regionCode ? { regionCode } : {}),
      ...(latitude !== undefined ? { latitude } : {}),
      ...(longitude !== undefined ? { longitude } : {}),
    }) ??
    findMetroByKey(regionCode ? provinceDefaultMetroByRegionCode[regionCode] : undefined);

  const source =
    input.source ??
    (input.countryCode || input.city || input.regionCode || input.postalCode
      ? "cloudflare"
      : timezone
        ? "timezone"
        : "default");

  let confidence = 0.35;
  if (city) {
    confidence = 0.95;
  } else if (latitude !== undefined && longitude !== undefined) {
    confidence = 0.8;
  } else if (regionCode) {
    confidence = 0.6;
  } else if (timezone) {
    confidence = 0.45;
  }

  return {
    countryCode,
    ...(regionCode ? { regionCode } : {}),
    ...(city ? { city } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(metro ? { metroKey: metro.key } : {}),
    confidence,
    source,
    ...(timezone ? { timezone } : {}),
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
  };
}

export function getMetroAreaCodePriority(context: Pick<NumberSuggestionContext, "metroKey">): string[] {
  return findMetroByKey(context.metroKey)?.areaCodes ?? [];
}

export function buildSuggestedSelectionContext(
  context: NumberSuggestionContext,
): NumberSelectionContext {
  return {
    mode: "suggested",
    countryCode: context.countryCode,
    ...(context.regionCode ? { regionCode: context.regionCode } : {}),
    ...(context.city ? { city: context.city } : {}),
    ...(context.metroKey ? { metroKey: context.metroKey } : {}),
  };
}

export function buildCitySelectionContext(input: {
  countryCode: string;
  city: string;
  regionCode?: string;
}): NumberSelectionContext {
  return {
    mode: "city",
    countryCode: input.countryCode,
    city: input.city,
    ...(input.regionCode ? { regionCode: input.regionCode } : {}),
  };
}

export function buildAreaCodeSelectionContext(input: {
  countryCode: string;
  areaCode: string;
}): NumberSelectionContext {
  return {
    mode: "area_code",
    countryCode: input.countryCode,
    areaCode: input.areaCode,
  };
}

export function buildTollFreeSelectionContext(input: {
  countryCode: string;
}): NumberSelectionContext {
  return {
    mode: "toll_free",
    countryCode: input.countryCode,
  };
}
