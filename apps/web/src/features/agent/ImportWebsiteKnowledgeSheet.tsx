import { FormEvent, useState } from "react";
import { useAction } from "convex/react";
import { Globe, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { captureAnalyticsException } from "@/lib/analytics";

export function ImportWebsiteKnowledgeSheet({
  businessId,
  open,
  onOpenChange,
}: {
  businessId: Id<"businesses">;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation("agent");
  const submitWebsiteIngestion = useAction(api.ai.context.websiteIngestion.submitWebsiteIngestion);
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isDialogOpen = isControlled ? open : internalOpen;

  function resetState(): void {
    setWebsiteUrl("");
    setErrorMessage(null);
    setIsSubmitting(false);
  }

  function setDialogOpen(nextOpen: boolean): void {
    onOpenChange?.(nextOpen);
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedWebsiteUrl = websiteUrl.trim();
    if (!trimmedWebsiteUrl) {
      setErrorMessage(t("sections.knowledge.websiteImport.validation.urlRequired"));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await submitWebsiteIngestion({
        businessId,
        websiteUrl: trimmedWebsiteUrl,
      });
      toast.success(t("sections.knowledge.websiteImport.success"));
      setDialogOpen(false);
      resetState();
    } catch (error) {
      captureAnalyticsException(error, {
        businessId: String(businessId),
        operation: "website_knowledge_import",
      });
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : t("sections.knowledge.websiteImport.submitFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setDialogOpen(nextOpen);
        if (!nextOpen) {
          resetState();
        }
      }}
      open={isDialogOpen}
    >
      {!isControlled ? (
        <DialogTrigger
          render={
            <Button variant="secondary">
              <Globe data-icon="inline-start" />
              {t("sections.knowledge.addKnowledgeOptions.website")}
            </Button>
          }
        />
      ) : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sections.knowledge.websiteImport.title")}</DialogTitle>
          <DialogDescription>
            {t("sections.knowledge.websiteImport.description")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldContent>
                <FieldLabel htmlFor="knowledge-website-url">
                  {t("sections.knowledge.fields.websiteUrl.label")}
                </FieldLabel>
                <FieldDescription>
                  {t("sections.knowledge.fields.websiteUrl.hint")}
                </FieldDescription>
              </FieldContent>
              <Input
                autoComplete="url"
                id="knowledge-website-url"
                onChange={(event) => {
                  setWebsiteUrl(event.target.value);
                  if (errorMessage) {
                    setErrorMessage(null);
                  }
                }}
                placeholder={t("sections.knowledge.fields.websiteUrl.placeholder")}
                type="url"
                value={websiteUrl}
              />
            </Field>
          </FieldGroup>

          {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

          <DialogFooter>
            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  {t("sections.knowledge.websiteImport.submitting")}
                </>
              ) : (
                t("sections.knowledge.websiteImport.submit")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
