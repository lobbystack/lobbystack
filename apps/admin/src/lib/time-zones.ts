/** The regions IANA groups its zones under, in the order the picker lists them. */
export const TIME_ZONE_REGIONS = ["Africa", "America", "Antarctica", "Arctic", "Asia", "Atlantic", "Australia", "Europe", "Indian", "Pacific"] as const;

export type TimeZoneRegion = (typeof TIME_ZONE_REGIONS)[number];
export type TimeZoneOption = { id: string; label: string };
/** Zones under one region. `region` is null for zones without one, such as UTC. */
export type TimeZoneGroup = { region: string | null; zones: TimeZoneOption[] };

export function isTimeZoneRegion(region: string | null): region is TimeZoneRegion {
  return (TIME_ZONE_REGIONS as readonly (string | null)[]).includes(region);
}

/**
 * Every IANA zone the browser knows, worldwide, plus UTC, which browsers leave
 * out, and the business's own zone when the list lacks it, as with an alias
 * such as US/Eastern.
 */
export function availableTimeZones(current: string): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set([...zones, "UTC", current])];
}

/** The zone's UTC offset at `at` in the dashboard language, such as GMT-07:00, or "" when the browser can't tell. */
export function timeZoneOffset(zone: string, locale: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(at).find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/**
 * Groups zones by region for the picker. Each zone is labelled with its city
 * and current offset, such as "Vancouver (GMT-07:00)", and cities sort in the
 * dashboard language. Zones without a region come first.
 */
export function groupTimeZones(zones: readonly string[], locale: string, at: Date = new Date()): TimeZoneGroup[] {
  const groups = new Map<string | null, TimeZoneOption[]>();
  for (const id of new Set(zones)) {
    const slash = id.indexOf("/");
    const region = slash === -1 ? null : id.slice(0, slash);
    const city = (slash === -1 ? id : id.slice(slash + 1)).replaceAll("_", " ").replaceAll("/", " / ");
    const offset = timeZoneOffset(id, locale, at);
    const options = groups.get(region) ?? [];
    options.push({ id, label: offset ? `${city} (${offset})` : city });
    groups.set(region, options);
  }
  const collator = new Intl.Collator(locale);
  const rank = (region: string | null) => region === null ? -1 : isTimeZoneRegion(region) ? TIME_ZONE_REGIONS.indexOf(region) : TIME_ZONE_REGIONS.length;
  return [...groups.entries()]
    .sort(([left], [right]) => rank(left) - rank(right) || collator.compare(left ?? "", right ?? ""))
    .map(([region, options]) => ({ region, zones: options.sort((left, right) => collator.compare(left.label, right.label)) }));
}
