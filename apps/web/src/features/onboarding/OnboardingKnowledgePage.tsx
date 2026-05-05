import { useRef, useState } from "react";
import type { DragEvent } from "react";

import { useTranslation } from "react-i18next";
import { CheckCircle2, FileText, LoaderCircle, Upload, X } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Surface } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { captureAnalyticsEvent, captureAnalyticsException } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";

type OnboardingKnowledgePageProps = {
  businessId: Id<"businesses">;
  onSignOut: () => void;
};

const ACCEPTED_FILE_TYPES =
  ".pdf,.docx,.txt,.md,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;

type UploadStatus = "uploading" | "completed" | "error";

type UploadEntry = {
  id: string;
  fileName: string;
  status: UploadStatus;
  errorMessage?: string;
};

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

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/u, "").trim();
}

export function OnboardingKnowledgePage({ businessId, onSignOut }: OnboardingKnowledgePageProps) {
  const { t } = useTranslation("onboarding");
  const generateUploadUrl = useObservedMutation(
    api.ai.context.knowledge.generateKnowledgeDocumentUploadUrl,
    { reportFailures: false },
  );
  const finalizeKnowledgeDocumentUpload = useObservedAction(
    api.ai.context.knowledge.finalizeKnowledgeDocumentUpload,
    { reportFailures: false },
  );
  const upsertKnowledgeSnippet = useObservedMutation(
    api.ai.context.knowledge.upsertKnowledgeSnippet,
  );
  const completeOnboardingKnowledge = useObservedMutation(
    api.onboarding.knowledge.completeOnboardingKnowledge,
  );
  const skipOnboardingKnowledge = useObservedMutation(
    api.onboarding.knowledge.skipOnboardingKnowledge,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [uploads, setUploads] = useState<Array<UploadEntry>>([]);
  const [pastedText, setPastedText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWorking = isFinalizing || isSkipping;
  const hasPasted = pastedText.trim().length > 0;

  function pushUpload(entry: UploadEntry): void {
    setUploads((existing) => [...existing, entry]);
  }

  function patchUpload(id: string, patch: Partial<UploadEntry>): void {
    setUploads((existing) =>
      existing.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }

  function removeUpload(id: string): void {
    setUploads((existing) => existing.filter((entry) => entry.id !== id));
  }

  async function handleSelectedFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) {
      return;
    }

    const tasks: Array<Promise<void>> = [];

    for (const file of Array.from(files)) {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${file.name}-${Date.now()}-${Math.random()}`;

      if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
        pushUpload({
          id,
          fileName: file.name,
          status: "error",
          errorMessage: t("knowledge.upload.tooLarge"),
        });
        continue;
      }

      const contentType = resolveFileContentType(file);
      if (!isSupportedContentType(contentType)) {
        pushUpload({
          id,
          fileName: file.name,
          status: "error",
          errorMessage: t("knowledge.upload.unsupportedType"),
        });
        continue;
      }

      pushUpload({ id, fileName: file.name, status: "uploading" });

      tasks.push(uploadOne(id, file, contentType));
    }

    await Promise.all(tasks);
  }

  async function uploadOne(id: string, file: File, contentType: string): Promise<void> {
    captureAnalyticsEvent("web.knowledge.upload_started", {
      businessId: String(businessId),
      section: "general",
      contentType,
    });

    try {
      const uploadUrl = await generateUploadUrl({ businessId });
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error("upload_failed");
      }
      const { storageId } = (await uploadResponse.json()) as { storageId: Id<"_storage"> };
      await finalizeKnowledgeDocumentUpload({
        businessId,
        storageId,
        fileName: file.name,
        title: stripExtension(file.name),
        tags: [],
      });
      captureAnalyticsEvent("web.knowledge.upload_completed", {
        businessId: String(businessId),
        section: "general",
        contentType,
      });
      patchUpload(id, { status: "completed" });
    } catch (uploadError) {
      captureAnalyticsException(uploadError, {
        businessId: String(businessId),
        section: "general",
        contentType,
        operation: "onboarding_knowledge_upload",
      });
      patchUpload(id, {
        status: "error",
        errorMessage:
          uploadError instanceof Error
            ? uploadError.message
            : t("knowledge.upload.failed"),
      });
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setIsDragging(false);
    void handleSelectedFiles(event.dataTransfer?.files ?? null);
  }

  async function handleContinue(): Promise<void> {
    if (isWorking) {
      return;
    }

    setIsFinalizing(true);
    setError(null);

    try {
      if (hasPasted) {
        const trimmed = pastedText.trim();
        await upsertKnowledgeSnippet({
          businessId,
          title: t("knowledge.paste.defaultTitle"),
          content: trimmed,
          tags: ["onboarding"],
          priority: 50,
          active: true,
        });
        captureAnalyticsEvent("web.knowledge.upload_completed", {
          businessId: String(businessId),
          section: "general",
          contentType: "text/plain",
        });
      }

      await completeOnboardingKnowledge({ businessId });
      captureAnalyticsEvent("web.onboarding.knowledge_uploaded", {
        businessId: String(businessId),
      });
    } catch (continueError) {
      setError(
        continueError instanceof Error
          ? continueError.message
          : t("knowledge.continueFailed"),
      );
    } finally {
      setIsFinalizing(false);
    }
  }

  async function handleSkip(): Promise<void> {
    if (isWorking) {
      return;
    }

    setIsSkipping(true);
    setError(null);

    try {
      await skipOnboardingKnowledge({ businessId });
      captureAnalyticsEvent("web.onboarding.knowledge_skipped", {
        businessId: String(businessId),
      });
    } catch (skipError) {
      setError(skipError instanceof Error ? skipError.message : t("knowledge.skipFailed"));
    } finally {
      setIsSkipping(false);
    }
  }

  return (
    <OnboardingShell
      description={t("knowledge.description")}
      onSignOut={onSignOut}
      progress={{ current: 4, total: 10 }}
      title={t("knowledge.title")}
      width="lg"
      footer={
        <div className="flex flex-col items-center gap-3">
          <button
            className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
            disabled={isWorking}
            onClick={() => void handleSkip()}
            type="button"
          >
            {isSkipping ? t("knowledge.skipping") : t("knowledge.skip")}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <Tabs onValueChange={(value) => setTab(value as "upload" | "paste")} value={tab}>
          <TabsList className="w-full">
            <TabsTrigger value="upload">{t("knowledge.tabs.upload")}</TabsTrigger>
            <TabsTrigger value="paste">{t("knowledge.tabs.paste")}</TabsTrigger>
          </TabsList>
          <TabsContent className="mt-4" value="upload">
            <input
              accept={ACCEPTED_FILE_TYPES}
              className="sr-only"
              id="onboarding-knowledge-file"
              multiple
              onChange={(event) => {
                void handleSelectedFiles(event.target.files);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              ref={fileInputRef}
              type="file"
            />
            <label
              className={cn(
                "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card p-10 text-center transition-colors",
                isDragging
                  ? "border-foreground/60 bg-muted/40"
                  : "border-border hover:border-foreground/40 hover:bg-muted/20",
              )}
              htmlFor="onboarding-knowledge-file"
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDrop={handleDrop}
            >
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-base font-medium text-foreground">
                  {t("knowledge.upload.headline")}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t("knowledge.upload.formats")}
                </span>
              </div>
            </label>

            {uploads.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-2">
                {uploads.map((entry) => (
                  <li className="contents" key={entry.id}>
                    <Surface className="flex w-full items-center gap-3 px-4 py-3">
                      <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                      <div className="flex flex-1 flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {entry.fileName}
                        </span>
                        {entry.status === "error" && entry.errorMessage ? (
                          <span className="text-xs text-destructive">{entry.errorMessage}</span>
                        ) : null}
                      </div>
                      {entry.status === "uploading" ? (
                        <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
                      ) : null}
                      {entry.status === "completed" ? (
                        <CheckCircle2 className="size-4 text-foreground" aria-hidden="true" />
                      ) : null}
                      <Button
                        aria-label={t("knowledge.upload.remove")}
                        onClick={() => removeUpload(entry.id)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <X className="size-4" />
                      </Button>
                    </Surface>
                  </li>
                ))}
              </ul>
            ) : null}
          </TabsContent>

          <TabsContent className="mt-4" value="paste">
            <Textarea
              autoFocus
              className="min-h-48 rounded-xl"
              id="onboarding-knowledge-paste"
              onChange={(event) => setPastedText(event.target.value)}
              placeholder={t("knowledge.paste.placeholder")}
              value={pastedText}
            />
            <p className="mt-2 text-xs text-muted-foreground">{t("knowledge.paste.hint")}</p>
          </TabsContent>
        </Tabs>

        {error ? <FieldError>{error}</FieldError> : null}

        <Button
          className="h-11 w-full"
          disabled={isWorking}
          onClick={() => void handleContinue()}
          type="button"
        >
          {isFinalizing ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              {t("knowledge.continuing")}
            </>
          ) : (
            t("knowledge.continue")
          )}
        </Button>
      </div>
    </OnboardingShell>
  );
}
