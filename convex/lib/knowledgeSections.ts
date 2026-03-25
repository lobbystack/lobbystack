import { v } from "convex/values";

export const knowledgeSectionValidator = v.union(
  v.literal("knowledge"),
  v.literal("services"),
  v.literal("rules"),
);

export type KnowledgeSection = "knowledge" | "services" | "rules";

export function resolveKnowledgeSection(section: string | undefined | null): KnowledgeSection {
  if (section === "services" || section === "rules") {
    return section;
  }

  return "knowledge";
}
