import { generateObject } from "ai";
import { z } from "zod";
import { createNonRealtimeTextModel } from "./providers/nonRealtimeText";
import {
  normalizeLocalizedServiceNames,
  type LocalizedServiceNames,
} from "./serviceNames";

const localizedServiceNamesSchema = z.object({
  en: z.string().min(1),
  fr: z.string().min(1),
});

export async function generateMissingLocalizedServiceNames(input: {
  name: string;
  localizedNames?: LocalizedServiceNames;
}): Promise<LocalizedServiceNames> {
  const canonicalName = input.name.trim();
  const existing = normalizeLocalizedServiceNames(input.localizedNames) ?? {};
  if (existing.en && existing.fr) {
    return existing;
  }

  try {
    const result = await generateObject({
      model: createNonRealtimeTextModel(),
      schema: localizedServiceNamesSchema,
      prompt: [
        "Generate customer-facing service labels for an AI receptionist booking system.",
        `Canonical operator service label: ${canonicalName}`,
        existing.en ? `Existing English label: ${existing.en}` : "English label is missing.",
        existing.fr ? `Existing French label: ${existing.fr}` : "French label is missing.",
        "Return short natural labels only, not sentences.",
        "Preserve brand names and proper nouns when appropriate.",
        "Do not add quotation marks, explanations, or extra metadata.",
      ].join("\n"),
    });

    return (
      normalizeLocalizedServiceNames({
        en: existing.en ?? result.object.en,
        fr: existing.fr ?? result.object.fr,
      }) ?? { en: canonicalName, fr: canonicalName }
    );
  } catch {
    return {
      en: existing.en ?? canonicalName,
      fr: existing.fr ?? canonicalName,
    };
  }
}
