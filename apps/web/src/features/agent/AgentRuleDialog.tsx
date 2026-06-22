import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useObservedMutation } from "@/lib/observed-convex";

export function AgentRuleDialog({
  businessId,
  mode = "create",
  rule,
  open,
  onOpenChange,
}: {
  businessId: Id<"businesses">;
  mode?: "create" | "edit";
  rule?: Doc<"agent_rules"> | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation("agent");
  const upsertRule = useObservedMutation(api.ai.context.rules.upsertRule);
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const titleId = useId();
  const contentId = useId();
  const isDialogOpen = isControlled ? open : internalOpen;
  const dialogTitle =
    mode === "edit" ? t("sections.rules.editKnowledge") : t("sections.rules.addKnowledge");
  const dialogDescription =
    mode === "edit"
      ? t("sections.rules.editKnowledgeDescription")
      : t("sections.rules.addKnowledgeDescription");
  const submitLabel = mode === "edit" ? t("actions.saveChanges") : t("actions.save");
  const trigger = useMemo(() => {
    if (mode !== "create" || isControlled) {
      return null;
    }

    return (
      <Button>
        <Plus data-icon="inline-start" />
        {t("sections.rules.addKnowledge")}
      </Button>
    );
  }, [isControlled, mode, t]);

  useEffect(() => {
    if (!isDialogOpen) {
      setTitle("");
      setContent("");
      setIsSaving(false);
      return;
    }

    setTitle(rule?.title ?? "");
    setContent(rule?.content ?? "");
  }, [isDialogOpen, rule]);

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
    if (!trimmedTitle || !trimmedContent) {
      return;
    }

    setIsSaving(true);
    try {
      await upsertRule({
        businessId,
        ...(mode === "edit" && rule ? { ruleId: rule._id } : {}),
        title: trimmedTitle,
        content: trimmedContent,
        ...(rule ? { active: rule.active, order: rule.order } : {}),
      });
      setDialogOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={setDialogOpen} open={isDialogOpen}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldContent>
                <FieldLabel htmlFor={titleId}>
                  {t("sections.rules.fields.title.label")}
                </FieldLabel>
                <FieldDescription>{t("sections.rules.fields.title.hint")}</FieldDescription>
              </FieldContent>
              <Input
                id={titleId}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("sections.rules.fields.title.placeholder")}
                value={title}
              />
            </Field>
            <Field>
              <FieldContent>
                <FieldLabel htmlFor={contentId}>
                  {t("sections.rules.fields.content.label")}
                </FieldLabel>
                <FieldDescription>{t("sections.rules.fields.content.hint")}</FieldDescription>
              </FieldContent>
              <Textarea
                className="min-h-40"
                id={contentId}
                onChange={(event) => setContent(event.target.value)}
                placeholder={t("sections.rules.fields.content.placeholder")}
                value={content}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button className="w-full" disabled={isSaving} type="submit">
              {isSaving ? t("actions.saving") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
