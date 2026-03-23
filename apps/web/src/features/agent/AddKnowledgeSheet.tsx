import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
          <Button>
            <Plus data-icon="inline-start" />
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
        <form className="flex h-full flex-col px-4 pb-4" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="knowledge-title">
                {t("agent:sections.knowledge.fields.title.label")}
              </FieldLabel>
              <FieldDescription>
                {t("agent:sections.knowledge.fields.title.hint")}
              </FieldDescription>
              <Input
                id="knowledge-title"
                placeholder={t("agent:sections.knowledge.fields.title.placeholder")}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="knowledge-content">
                {t("agent:sections.knowledge.fields.content.label")}
              </FieldLabel>
              <FieldDescription>
                {t("agent:sections.knowledge.fields.content.hint")}
              </FieldDescription>
              <Textarea
                className="min-h-40"
                id="knowledge-content"
                placeholder={t("agent:sections.knowledge.fields.content.placeholder")}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="knowledge-tags">
                {t("agent:sections.knowledge.fields.tags.label")}
              </FieldLabel>
              <FieldDescription>
                {t("agent:sections.knowledge.fields.tags.hint")}
              </FieldDescription>
              <Input
                id="knowledge-tags"
                placeholder={t("agent:sections.knowledge.fields.tags.placeholder")}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </Field>
          </FieldGroup>

          <div className="mt-auto pt-6">
            <Button disabled={isSaving} type="submit">
              {isSaving ? t("agent:actions.saving") : t("agent:actions.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
