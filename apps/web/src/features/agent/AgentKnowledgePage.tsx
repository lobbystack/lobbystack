import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type AgentKnowledgePageProps = {
  businessId: Id<"businesses">;
};

export function AgentKnowledgePage({ businessId }: AgentKnowledgePageProps) {
  const { t } = useTranslation(["agent", "knowledge"]);
  const knowledge = useQuery(api.ai.context.knowledge.listKnowledge, {
    businessId,
  });
  const snippets = (knowledge?.snippets ?? []) as Array<Doc<"knowledge_snippets">>;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4">
        {knowledge && snippets.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
            <p>{t("agent:sections.knowledge.emptyState")}</p>
          </div>
        ) : null}

        {snippets.map((snippet) => (
          <Collapsible
            className="group rounded-2xl border border-border/70 bg-card shadow-sm"
            key={snippet._id}
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between p-4 outline-none">
              <div className="flex items-center gap-3">
                <span className="font-semibold">{snippet.title}</span>
                {snippet.tags?.length && snippet.tags[0] ? (
                  <Badge variant="secondary">{snippet.tags[0]}</Badge>
                ) : null}
              </div>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-open:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4">
                <div className="rounded-xl bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
                  {snippet.content}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
