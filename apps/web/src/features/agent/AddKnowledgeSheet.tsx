import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function parseTags(value: string): Array<string> {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function AddKnowledgeSheet({ businessId }: { businessId: Id<"businesses"> }) {
  const { t } = useTranslation(["agent", "knowledge"]);
  const upsertKnowledgeSnippet = useMutation(api.ai.context.knowledge.upsertKnowledgeSnippet);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (trimmedTitle.length === 0 || trimmedContent.length === 0) {
      return;
    }
    setIsSaving(true);
    try {
      await upsertKnowledgeSnippet({
        businessId,
        title: trimmedTitle,
        content: trimmedContent,
        tags: parseTags(tags),
        priority: 75,
        active: true,
      });
      setIsSheetOpen(false);
      setTitle("");
      setContent("");
      setTags("");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet onOpenChange={setIsSheetOpen} open={isSheetOpen}>
      <SheetTrigger
        render={
          <Button size="sm">
            <Plus className="mr-2 size-4" />
            {t("agent:sections.knowledge.addKnowledge")}
          </Button>
        }
      />
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("agent:sections.knowledge.addKnowledge")}</SheetTitle>
          <SheetDescription>
            {t("agent:sections.knowledge.addKnowledgeDescription")}
          </SheetDescription>
        </SheetHeader>
        <div className="py-6">
          <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="knowledge-title">
                {t("agent:sections.knowledge.fields.title.label")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("agent:sections.knowledge.fields.title.hint")}
              </p>
              <Input
                id="knowledge-title"
                placeholder={t("agent:sections.knowledge.fields.title.placeholder")}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="knowledge-content">
                {t("agent:sections.knowledge.fields.content.label")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("agent:sections.knowledge.fields.content.hint")}
              </p>
              <Textarea
                className="min-h-[150px]"
                id="knowledge-content"
                placeholder={t("agent:sections.knowledge.fields.content.placeholder")}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="knowledge-tags">
                {t("agent:sections.knowledge.fields.tags.label")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("agent:sections.knowledge.fields.tags.hint")}
              </p>
              <Input
                id="knowledge-tags"
                placeholder={t("agent:sections.knowledge.fields.tags.placeholder")}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </div>
            <div className="pt-4 flex items-center justify-end gap-3">
              <Button disabled={isSaving} type="submit">
                {isSaving
                  ? t("agent:actions.saving")
                  : t("agent:actions.save")}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
