import { FormEvent, useMemo, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";

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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const ACCEPTED_FILE_TYPES = ".pdf,.docx,.txt,.md,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function parseTags(value: string): Array<string> {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/u, "").trim();
}

function inferContentTypeFromFileName(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "md":
      return "text/markdown";
    case "txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

function isSupportedContentType(contentType: string): boolean {
  return [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "text/x-markdown",
  ].includes(contentType);
}

function resolveFileContentType(file: File): string {
  const providedType = file.type.trim();
  if (providedType.length > 0) {
    return providedType;
  }

  return inferContentTypeFromFileName(file.name);
}

export function UploadKnowledgeDocumentSheet({
  businessId,
}: {
  businessId: Id<"businesses">;
}) {
  const { t } = useTranslation("agent");
  const generateUploadUrl = useMutation(api.ai.context.knowledge.generateKnowledgeDocumentUploadUrl);
  const finalizeKnowledgeDocumentUpload = useAction(
    api.ai.context.knowledge.finalizeKnowledgeDocumentUpload,
  );

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const resolvedFileName = useMemo(() => selectedFile?.name ?? "", [selectedFile]);

  function resetState(): void {
    setSelectedFile(null);
    setTitle("");
    setTags("");
    setErrorMessage(null);
    setIsUploading(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedFile) {
      setErrorMessage(t("sections.knowledge.uploadValidation.fileRequired"));
      return;
    }

    const contentType = resolveFileContentType(selectedFile);
    if (!isSupportedContentType(contentType)) {
      setErrorMessage(t("sections.knowledge.uploadValidation.unsupportedFile"));
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const uploadUrl = await generateUploadUrl({ businessId });
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
        },
        body: selectedFile,
      });

      if (!uploadResponse.ok) {
        throw new Error("upload_failed");
      }

      const result = (await uploadResponse.json()) as { storageId: Id<"_storage"> };
      await finalizeKnowledgeDocumentUpload({
        businessId,
        storageId: result.storageId,
        fileName: selectedFile.name,
        title: title.trim(),
        tags: parseTags(tags),
      });

      setIsSheetOpen(false);
      resetState();
    } catch {
      setErrorMessage(t("sections.knowledge.uploadValidation.uploadFailed"));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Sheet
      onOpenChange={(open) => {
        setIsSheetOpen(open);
        if (!open) {
          resetState();
        }
      }}
      open={isSheetOpen}
    >
      <SheetTrigger
        render={
          <Button variant="secondary">
            <Upload data-icon="inline-start" />
            {t("actions.upload")}
          </Button>
        }
      />
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("sections.knowledge.uploadDocument")}</SheetTitle>
          <SheetDescription>
            {t("sections.knowledge.uploadDocumentDescription")}
          </SheetDescription>
        </SheetHeader>
        <form className="flex h-full flex-col px-4 pb-4" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="knowledge-document-file">
                {t("sections.knowledge.fields.file.label")}
              </FieldLabel>
              <FieldDescription>
                {t("sections.knowledge.fields.file.hint")}
              </FieldDescription>
              <Input
                accept={ACCEPTED_FILE_TYPES}
                id="knowledge-document-file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedFile(file);
                  setTitle(file ? stripExtension(file.name) : "");
                  setErrorMessage(null);
                }}
                type="file"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="knowledge-document-title">
                {t("sections.knowledge.fields.title.label")}
              </FieldLabel>
              <FieldDescription>
                {t("sections.knowledge.fields.title.hint")}
              </FieldDescription>
              <Input
                id="knowledge-document-title"
                placeholder={t("sections.knowledge.fields.title.placeholder")}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="knowledge-document-tags">
                {t("sections.knowledge.fields.tags.label")}
              </FieldLabel>
              <FieldDescription>
                {t("sections.knowledge.fields.tags.hint")}
              </FieldDescription>
              <Input
                id="knowledge-document-tags"
                placeholder={t("sections.knowledge.fields.tags.placeholder")}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </Field>
          </FieldGroup>

          <div className="mt-auto flex flex-col gap-3 pt-6">
            {resolvedFileName ? (
              <p className="text-sm text-muted-foreground">{resolvedFileName}</p>
            ) : null}
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
            <Button disabled={isUploading} type="submit">
              {isUploading ? t("actions.uploading") : t("actions.upload")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
