import { useState } from "react";
import { useAction } from "convex/react";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { demoSnapshot } from "@ai-receptionist/testing";

import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

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
    <Card>
      <CardHeader>
        <CardTitle>Preview Receptionist</CardTitle>
        <CardDescription>
          This preview uses the same business context layer as SMS. Live voice still uses
          the precomputed snapshot at call start instead of per-turn backend retrieval.
        </CardDescription>
      </CardHeader>
      <CardContent className="stack">
        <label className="stack">
          <span className="kpi-label">Prompt</span>
          <textarea
            className="prompt-preview"
            disabled={!props.enabled || isLoading}
            rows={5}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        <Button disabled={!props.enabled || isLoading} onClick={() => void handlePreview()}>
          {isLoading ? "Generating..." : "Run Preview"}
        </Button>
        <div className="preview-bubble preview-user">{prompt}</div>
        <div className="preview-bubble preview-agent">{response}</div>
        {!props.enabled ? (
          <p className="muted">Sign in and create a business to run the real preview flow.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
