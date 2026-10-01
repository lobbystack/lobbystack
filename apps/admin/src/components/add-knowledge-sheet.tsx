"use client";

import { FormEvent, useEffect, useId, useMemo, useState } from "react";

import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

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

function parseTags(value: string): Array<string> {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatTags(tags: Array<string> | undefined): string {
  return (tags ?? []).join(", ");
}

export function AddKnowledgeSheet({
  save,
  section,
  mode = "create",
  snippet,
  open,
  onOpenChange,
}: {
  save: (input: { title: string; content: string; tags: string[]; priority: number; active: boolean }) => Promise<void>;
  section: "knowledge";
  mode?: "create" | "edit";
  snippet?: { title: string; content: string; tags?: string[]; priority: number; active: boolean } | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation(["agent", "knowledge"]);
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const titleId = useId();
  const contentId = useId();
  const tagsId = useId();
  const isDialogOpen = isControlled ? open : internalOpen;
  const dialogTitle =
    mode === "edit"
      ? t(`agent:sections.${section}.editKnowledge`)
      : t(`agent:sections.${section}.addKnowledge`);
  const dialogDescription =
    mode === "edit"
      ? t(`agent:sections.${section}.editKnowledgeDescription`)
      : t(`agent:sections.${section}.addKnowledgeDescription`);
  const submitLabel = mode === "edit" ? t("agent:actions.saveChanges") : t("agent:actions.save");
  const trigger = useMemo(() => {
    if (mode !== "create" || isControlled) {
      return null;
    }

    return (
      <Button>
        <Plus data-icon="inline-start" />
        {t(`agent:sections.${section}.addKnowledge`)}
      </Button>
    );
  }, [isControlled, mode, section, t]);

  useEffect(() => {
    if (!isDialogOpen) {
      setTitle("");
      setContent("");
      setTags("");
      setIsSaving(false);
      return;
    }

    setTitle(snippet?.title ?? "");
    setContent(snippet?.content ?? "");
    setTags(formatTags(snippet?.tags));
  }, [isDialogOpen, snippet]);

  function setDialogOpen(nextOpen: boolean): void {
    onOpenChange?.(nextOpen);
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (trimmedTitle.length === 0 || trimmedContent.length === 0) {
      return;
    }
    setIsSaving(true);
    try {
      await save({
        title: trimmedTitle,
        content: trimmedContent,
        tags: parseTags(tags),
        priority: snippet?.priority ?? 75,
        active: snippet?.active ?? true,
      });
      setDialogOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={setDialogOpen} open={isDialogOpen}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className="max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <form className="flex min-h-0 flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
          {/* The fields scroll and the footer stays put, so a long paste never
              pushes the save button off screen. The inset keeps focus rings
              clear of the scroll edge. */}
          <div className="-m-1 min-h-0 overflow-y-auto p-1">
            <FieldGroup>
              <Field>
                <FieldContent>
                  <FieldLabel htmlFor={titleId}>
                    {t(`agent:sections.${section}.fields.title.label`)}
                  </FieldLabel>
                  <FieldDescription>
                    {t(`agent:sections.${section}.fields.title.hint`)}
                  </FieldDescription>
                </FieldContent>
                <Input
                  id={titleId}
                  placeholder={t(`agent:sections.${section}.fields.title.placeholder`)}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>

              <Field>
                <FieldContent>
                  <FieldLabel htmlFor={contentId}>
                    {t(`agent:sections.${section}.fields.content.label`)}
                  </FieldLabel>
                  <FieldDescription>
                    {t(`agent:sections.${section}.fields.content.hint`)}
                  </FieldDescription>
                </FieldContent>
                <Textarea
                  className="max-h-[40svh] min-h-40 overflow-y-auto"
                  id={contentId}
                  placeholder={t(`agent:sections.${section}.fields.content.placeholder`)}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                />
              </Field>

              <Field>
                <FieldContent>
                  <FieldLabel htmlFor={tagsId}>
                    {t(`agent:sections.${section}.fields.tags.label`)}
                  </FieldLabel>
                  <FieldDescription>
                    {t(`agent:sections.${section}.fields.tags.hint`)}
                  </FieldDescription>
                </FieldContent>
                <Input
                  id={tagsId}
                  placeholder={t(`agent:sections.${section}.fields.tags.placeholder`)}
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                />
              </Field>
            </FieldGroup>
          </div>

          <DialogFooter>
            <Button className="w-full" disabled={isSaving} type="submit">
              {isSaving ? t("agent:actions.saving") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
