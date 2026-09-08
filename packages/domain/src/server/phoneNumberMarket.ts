// Original verified-phone market mapping and metro preference order.

export type NumberSuggestionContext = {
  countryCode: string;
  regionCode?: string;
  city?: string;
  postalCode?: string;
  metroKey?: string;
  preferredAreaCode?: string;
  confidence: number;
  source: "cloudflare" | "timezone" | "default" | "verified_phone";
  timezone?: string;
  latitude?: number;
  longitude?: number;
};


export type VerifiedPhoneMarket = {
  phoneE164: string;
  countryCode: string;
  nationalDestinationCode?: string;
  areaCode?: string;
  regionCode?: string;
  city?: string;
  metroKey?: string;
  confidence: number;
  source: "verified_phone" | "verified_phone_country";
};


type MetroDefinition = {
  key: string;
  countryCode: string;
  regionCode: string;
  areaCodes: string[];
  primaryCity: string;
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
    primaryCity: "Quebec City",
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
    primaryCity: "Montreal",
    latitude: 45.5019,
    longitude: -73.5674,
    localityAliases: ["montreal", "westmount", "verdun", "outremont", "saint laurent"],
  },
  {
    key: "south_shore",
    countryCode: "CA",
    regionCode: "QC",
    areaCodes: ["450", "579", "354"],
    primaryCity: "Longueuil",
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
    primaryCity: "Gatineau",
    latitude: 45.4042,
    longitude: -71.8929,
    localityAliases: ["gatineau", "sherbrooke", "trois rivieres", "drummondville"],
  },
  {
    key: "toronto",
    countryCode: "CA",
    regionCode: "ON",
    areaCodes: ["416", "647", "437"],
    primaryCity: "Toronto",
    latitude: 43.6532,
    longitude: -79.3832,
    localityAliases: ["toronto", "north york", "scarborough", "etobicoke"],
  },
  {
    key: "vancouver",
    countryCode: "CA",
    regionCode: "BC",
    areaCodes: ["604", "778", "236", "672"],
    primaryCity: "Vancouver",
    latitude: 49.2827,
    longitude: -123.1207,
    localityAliases: ["vancouver", "burnaby", "surrey", "richmond", "new westminster"],
  },
  {
    key: "calgary",
    countryCode: "CA",
    regionCode: "AB",
    areaCodes: ["403", "587", "368", "825"],
    primaryCity: "Calgary",
    latitude: 51.0447,
    longitude: -114.0719,
    localityAliases: ["calgary", "airdrie", "okotoks"],
  },
  {
    key: "halifax",
    countryCode: "CA",
    regionCode: "NS",
    areaCodes: ["902", "782"],
    primaryCity: "Halifax",
    latitude: 44.6488,
    longitude: -63.5752,
    localityAliases: ["halifax", "dartmouth", "bedford"],
  },
];


function findMetroByKey(key: string | undefined): MetroDefinition | null {
  if (!key) {
    return null;
  }
  return canadianMetros.find((metro) => metro.key === key) ?? null;
}

function findMetroByAreaCode(countryCode: string, areaCode: string | undefined): MetroDefinition | null {
  if (!areaCode) {
    return null;
  }

  return (
    canadianMetros.find(
      (metro) => metro.countryCode === countryCode && metro.areaCodes.includes(areaCode),
    ) ?? null
  );
}


function getNanpAreaCode(phoneE164: string, countryCode: string): string | undefined {
  if (!["CA", "US"].includes(countryCode)) {
    return undefined;
  }

  const digits = phoneE164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1, 4);
  }

  if (digits.length === 10) {
    return digits.slice(0, 3);
  }

  return undefined;
}

export function resolveVerifiedPhoneMarket(input: {
  phoneE164: string;
  countryCode: string;
}): VerifiedPhoneMarket {
  const countryCode = input.countryCode.trim().toUpperCase();
  const areaCode = getNanpAreaCode(input.phoneE164, countryCode);
  const metro = findMetroByAreaCode(countryCode, areaCode);

  if (metro) {
    return {
      phoneE164: input.phoneE164,
      countryCode,
      ...(areaCode ? { nationalDestinationCode: areaCode } : {}),
      ...(areaCode ? { areaCode } : {}),
      regionCode: metro.regionCode,
      city: metro.primaryCity,
      metroKey: metro.key,
      confidence: 0.95,
      source: "verified_phone",
    };
  }

  if (areaCode) {
    return {
      phoneE164: input.phoneE164,
      countryCode,
      nationalDestinationCode: areaCode,
      areaCode,
      confidence: 0.9,
      source: "verified_phone",
    };
  }

  return {
    phoneE164: input.phoneE164,
    countryCode,
    confidence: 0.75,
    source: "verified_phone_country",
  };
}

export function buildSuggestionContextFromVerifiedPhoneMarket(
  market: VerifiedPhoneMarket,
): NumberSuggestionContext {
  return {
    countryCode: market.countryCode,
    ...(market.regionCode ? { regionCode: market.regionCode } : {}),
    ...(market.city ? { city: market.city } : {}),
    ...(market.metroKey ? { metroKey: market.metroKey } : {}),
    ...(market.areaCode ? { preferredAreaCode: market.areaCode } : {}),
    confidence: market.confidence,
    source: "verified_phone",
  };
}

export function getMetroAreaCodePriority(
  context: Pick<NumberSuggestionContext, "metroKey" | "preferredAreaCode">,
): string[] {
  const areaCodes = findMetroByKey(context.metroKey)?.areaCodes ?? [];
  if (!context.preferredAreaCode) {
    return areaCodes;
  }

  if (areaCodes.length === 0) {
    return [context.preferredAreaCode];
  }

  return [
    context.preferredAreaCode,
    ...areaCodes.filter((areaCode) => areaCode !== context.preferredAreaCode),
  ];
}

