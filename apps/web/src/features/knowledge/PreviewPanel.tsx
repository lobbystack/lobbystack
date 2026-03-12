import { useState } from "react";
import { useAction } from "convex/react";
import { IconSparkles } from "@tabler/icons-react";
import { demoSnapshot } from "@ai-receptionist/shared";

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
  const previewKnowledgeAnswer = useAction(api.ai.context.knowledge.previewKnowledgeAnswer);
  const [prompt, setPrompt] = useState("What time are you open tomorrow?");
  const [response, setResponse] = useState(
    `We are open based on the business snapshot in ${demoSnapshot.timezone}. In the full implementation this response comes from the preview agent thread, not from the live voice loop.`,
  );
  const [isLoading, setIsLoading] = useState(false);

  async function handlePreview(): Promise<void> {
    if (!props.enabled || !props.businessId) {
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
            <CardTitle>Preview Receptionist</CardTitle>
            <CardDescription>
              Test the same business context layer used for SMS and async AI flows before you put it in front of callers.
            </CardDescription>
          </div>
          <IconSparkles className="size-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
            Prompt
          </p>
          <Textarea
            disabled={!props.enabled || isLoading}
            rows={5}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </div>
        <Button disabled={!props.enabled || isLoading} onClick={() => void handlePreview()}>
          {isLoading ? "Generating..." : "Run Preview"}
        </Button>
        <div className="space-y-3">
          <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
            <div className="mb-2 text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              Customer
            </div>
            <div className="text-sm leading-6 text-foreground">{prompt}</div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
            <div className="mb-2 text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              Receptionist
            </div>
            <div className="text-sm leading-6 text-foreground">{response}</div>
          </div>
        </div>
        {!props.enabled ? (
          <p className="text-sm text-muted-foreground">
            Sign in and create a business to run the real preview flow.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
