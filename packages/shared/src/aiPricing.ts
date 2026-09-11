export type AiPricingRatesUsdPerMillionTokens = {
  textInput?: number;
  cachedInput?: number;
  textOutput?: number;
  audioInput?: number;
  audioOutput?: number;
};

export type VersionedAiPricing = {
  version: string;
  /** ISO date of the published rate schedule applied to this usage. */
  effectiveDate: string;
  sourceUrl: string;
  ratesUsdPerMillionTokens: AiPricingRatesUsdPerMillionTokens;
};

// Source: https://developers.openai.com/api/docs/models/gpt-realtime-2.1
// Keep this catalog deliberately narrow. An unlisted model is financially
// unknown until its deployed rate is explicitly configured.
const OPENAI_PRICING: Readonly<Record<string, VersionedAiPricing>> = {
  "gpt-realtime-2.1": {
    version: "openai-2026-09-09",
    effectiveDate: "2026-09-09",
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-realtime-2.1",
    ratesUsdPerMillionTokens: {
      textInput: 4,
      cachedInput: 0.4,
      textOutput: 24,
      audioInput: 32,
      audioOutput: 64,
    },
  },
};

export function resolveOpenAiPricing(model: string): VersionedAiPricing | undefined {
  return OPENAI_PRICING[model];
}
