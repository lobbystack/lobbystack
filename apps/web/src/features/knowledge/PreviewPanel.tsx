import { useState } from "react";
import { useAction } from "convex/react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type PreviewPanelProps = {
  businessId?: Id<"businesses"> | undefined;
  enabled: boolean;
};

export function PreviewPanel(props: PreviewPanelProps) {
  const { t } = useTranslation(["common", "knowledge"]);
  const previewKnowledgeAnswer = useAction(api.ai.context.knowledge.previewKnowledgeAnswer);
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handlePreview(): Promise<void> {
    if (!props.enabled || !props.businessId || prompt.trim().length === 0) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await previewKnowledgeAnswer({
        businessId: props.businessId,
        prompt,
      });
      setResponse(result.text);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>{t("knowledge:preview.title")}</CardTitle>
            <CardDescription>{t("knowledge:preview.description")}</CardDescription>
          </div>
          <Sparkles className="size-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("common:labels.prompt")}
          </p>
          <Textarea
            disabled={!props.enabled || isLoading}
            placeholder={t("knowledge:preview.promptPlaceholder")}
            rows={5}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </div>
        <Button
          disabled={!props.enabled || isLoading || prompt.trim().length === 0}
          onClick={() => void handlePreview()}
        >
          {isLoading ? t("knowledge:preview.generating") : t("knowledge:preview.generate")}
        </Button>
        <div className="space-y-3">
          <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              {t("common:labels.customer")}
            </div>
            <div className="text-sm leading-6 text-foreground">{prompt}</div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              {t("common:labels.receptionist")}
            </div>
            <div className="text-sm leading-6 text-foreground">
              {response ?? t("knowledge:preview.emptyResponse")}
            </div>
          </div>
        </div>
        {!props.enabled ? (
          <p className="text-sm text-muted-foreground">
            {t("knowledge:preview.disabled")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
