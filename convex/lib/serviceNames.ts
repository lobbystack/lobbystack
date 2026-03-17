import { v } from "convex/values";
import type { RuntimeLocale } from "./runtimeLocale";

export type LocalizedServiceNames = Partial<Record<RuntimeLocale, string>>;

export const localizedServiceNamesValidator = v.object({
  en: v.optional(v.string()),
  fr: v.optional(v.string()),
});

type ServiceNameRecord = {
  name: string;
  slug?: string;
  localizedNames?: LocalizedServiceNames;
};

function normalizeLocalizedLabel(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeLocalizedServiceNames(
  input: LocalizedServiceNames | undefined,
): LocalizedServiceNames | undefined {
  if (!input) {
    return undefined;
  }

  const normalized: LocalizedServiceNames = {};
  const english = normalizeLocalizedLabel(input.en);
  const french = normalizeLocalizedLabel(input.fr);

  if (english !== undefined) {
    normalized.en = english;
  }
  if (french !== undefined) {
    normalized.fr = french;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function getLocalizedServiceName(
  service: ServiceNameRecord,
  locale: RuntimeLocale,
): string {
  return normalizeLocalizedLabel(service.localizedNames?.[locale]) ?? service.name;
}

export function getServiceNameCandidates(service: ServiceNameRecord): Array<string> {
  const candidates = [
    service.name,
    service.slug,
    service.localizedNames?.en,
    service.localizedNames?.fr,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
}
