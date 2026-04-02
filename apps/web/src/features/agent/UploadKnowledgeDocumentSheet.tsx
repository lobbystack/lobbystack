import { type DragEvent, FormEvent, useMemo, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";

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
import { captureAnalyticsEvent } from "@/lib/analytics";
import type { AgentSection } from "./sections";

const ACCEPTED_FILE_TYPES = ".pdf,.docx,.txt,.md,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;

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
  section,
}: {
  businessId: Id<"businesses">;
  section: AgentSection;
}) {
  const { t } = useTranslation("agent");
  const generateUploadUrl = useMutation(api.ai.context.knowledge.generateKnowledgeDocumentUploadUrl);
  const finalizeKnowledgeDocumentUpload = useAction(
    api.ai.context.knowledge.finalizeKnowledgeDocumentUpload,
  );

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resolvedFileName = useMemo(() => selectedFile?.name ?? "", [selectedFile]);

  function resetState(): void {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setSelectedFile(null);
    setTitle("");
    setTags("");
    setErrorMessage(null);
    setIsUploading(false);
    setIsDraggingFile(false);
  }

  function handleSelectedFile(file: File | null): void {
    if (file && file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
      setSelectedFile(null);
      setTitle("");
      setErrorMessage(t(`sections.${section}.uploadValidation.maxSize`));
      return;
    }

    setSelectedFile(file);
    setTitle(file ? stripExtension(file.name) : "");
    setErrorMessage(null);
  }

  function handleFileDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setIsDraggingFile(false);
    handleSelectedFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedFile) {
      setErrorMessage(t(`sections.${section}.uploadValidation.fileRequired`));
      return;
    }

    const contentType = resolveFileContentType(selectedFile);
    if (!isSupportedContentType(contentType)) {
      setErrorMessage(t(`sections.${section}.uploadValidation.unsupportedFile`));
      return;
    }

    if (selectedFile.size > MAX_DOCUMENT_UPLOAD_BYTES) {
      setErrorMessage(t(`sections.${section}.uploadValidation.maxSize`));
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    captureAnalyticsEvent("web.knowledge.upload_started", {
      businessId: String(businessId),
      section,
      contentType,
    });

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
        section,
        storageId: result.storageId,
        fileName: selectedFile.name,
        title: title.trim(),
        tags: parseTags(tags),
      });
      captureAnalyticsEvent("web.knowledge.upload_completed", {
        businessId: String(businessId),
        section,
        contentType,
      });

      setIsDialogOpen(false);
      resetState();
    } catch {
      setErrorMessage(t(`sections.${section}.uploadValidation.uploadFailed`));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) {
          resetState();
        }
      }}
      open={isDialogOpen}
    >
      <DialogTrigger
        render={
          <Button variant="secondary">
            <Upload data-icon="inline-start" />
            {t("actions.upload")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`sections.${section}.uploadDocument`)}</DialogTitle>
          <DialogDescription>
            {t(`sections.${section}.uploadDocumentDescription`)}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldContent>
                <FieldLabel htmlFor="knowledge-document-file">
                  {t(`sections.${section}.fields.file.label`)}
                </FieldLabel>
                <FieldDescription>
                  {t(`sections.${section}.fields.file.hint`)}
                </FieldDescription>
              </FieldContent>
              <Input
                accept={ACCEPTED_FILE_TYPES}
                className="sr-only"
                id="knowledge-document-file"
                onChange={(event) => {
                  handleSelectedFile(event.target.files?.[0] ?? null);
                }}
                ref={fileInputRef}
                type="file"
              />
              <label
                className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition-colors ${
                  isDraggingFile
                    ? "border-foreground/30 bg-muted/40"
                    : "border-border/70 bg-muted/20 hover:bg-muted/30"
                }`}
                htmlFor="knowledge-document-file"
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    return;
                  }
                  setIsDraggingFile(false);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDrop={handleFileDrop}
              >
                <div className="flex flex-col items-center gap-3">
                  <Upload className="size-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t(`sections.${section}.fields.file.dropzonePrefix`)}{" "}
                    <span className="underline underline-offset-2">
                      {t(`sections.${section}.fields.file.chooseFile`)}
                    </span>
                  </p>
                  {resolvedFileName ? (
                    <p className="text-sm font-medium text-foreground">{resolvedFileName}</p>
                  ) : null}
                </div>
              </label>
            </Field>

            <Field>
              <FieldContent>
                <FieldLabel htmlFor="knowledge-document-title">
                  {t(`sections.${section}.fields.title.label`)}
                </FieldLabel>
                <FieldDescription>
                  {t(`sections.${section}.fields.title.hint`)}
                </FieldDescription>
              </FieldContent>
              <Input
                id="knowledge-document-title"
                placeholder={t(`sections.${section}.fields.title.placeholder`)}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>

            <Field>
              <FieldContent>
                <FieldLabel htmlFor="knowledge-document-tags">
                  {t(`sections.${section}.fields.tags.label`)}
                </FieldLabel>
                <FieldDescription>
                  {t(`sections.${section}.fields.tags.hint`)}
                </FieldDescription>
              </FieldContent>
              <Input
                id="knowledge-document-tags"
                placeholder={t(`sections.${section}.fields.tags.placeholder`)}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </Field>
          </FieldGroup>

          {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

          <DialogFooter>
            <Button className="w-full" disabled={isUploading} type="submit">
              {isUploading ? t("actions.saving") : t("actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
