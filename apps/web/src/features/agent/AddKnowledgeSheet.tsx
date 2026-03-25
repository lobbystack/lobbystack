import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AgentSection } from "./sections";

function parseTags(value: string): Array<string> {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function AddKnowledgeSheet({
  businessId,
  section,
}: {
  businessId: Id<"businesses">;
  section: AgentSection;
}) {
  const { t } = useTranslation(["agent", "knowledge"]);
  const upsertKnowledgeSnippet = useMutation(api.ai.context.knowledge.upsertKnowledgeSnippet);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
        section,
        title: trimmedTitle,
        content: trimmedContent,
        tags: parseTags(tags),
        priority: 75,
        active: true,
      });
      setIsDialogOpen(false);
      setTitle("");
      setContent("");
      setTags("");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus data-icon="inline-start" />
            {t(`agent:sections.${section}.addKnowledge`)}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`agent:sections.${section}.addKnowledge`)}</DialogTitle>
          <DialogDescription>
            {t(`agent:sections.${section}.addKnowledgeDescription`)}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldContent>
                <FieldLabel htmlFor="knowledge-title">
                  {t(`agent:sections.${section}.fields.title.label`)}
                </FieldLabel>
                <FieldDescription>
                  {t(`agent:sections.${section}.fields.title.hint`)}
                </FieldDescription>
              </FieldContent>
              <Input
                id="knowledge-title"
                placeholder={t(`agent:sections.${section}.fields.title.placeholder`)}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>

            <Field>
              <FieldContent>
                <FieldLabel htmlFor="knowledge-content">
                  {t(`agent:sections.${section}.fields.content.label`)}
                </FieldLabel>
                <FieldDescription>
                  {t(`agent:sections.${section}.fields.content.hint`)}
                </FieldDescription>
              </FieldContent>
              <Textarea
                className="min-h-40"
                id="knowledge-content"
                placeholder={t(`agent:sections.${section}.fields.content.placeholder`)}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </Field>

            <Field>
              <FieldContent>
                <FieldLabel htmlFor="knowledge-tags">
                  {t(`agent:sections.${section}.fields.tags.label`)}
                </FieldLabel>
                <FieldDescription>
                  {t(`agent:sections.${section}.fields.tags.hint`)}
                </FieldDescription>
              </FieldContent>
              <Input
                id="knowledge-tags"
                placeholder={t(`agent:sections.${section}.fields.tags.placeholder`)}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button className="w-full" disabled={isSaving} type="submit">
              {isSaving ? t("agent:actions.saving") : t("agent:actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
