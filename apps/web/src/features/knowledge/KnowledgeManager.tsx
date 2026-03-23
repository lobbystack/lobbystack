import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { BookOpenText, CircleQuestionMark, FileText } from "lucide-react";

import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type KnowledgeManagerProps = {
  businessId: Id<"businesses">;
};

function parseTags(value: string): Array<string> {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function KnowledgeManager(props: KnowledgeManagerProps) {
  const { t } = useTranslation("knowledge");
  const knowledge = useQuery(api.ai.context.knowledge.listKnowledge, {
    businessId: props.businessId,
  });
  const snippets = (knowledge?.snippets ?? []) as Array<Doc<"knowledge_snippets">>;
  const documents = (knowledge?.documents ?? []) as Array<Doc<"knowledge_documents">>;
  const upsertKnowledgeSnippet = useMutation(api.ai.context.knowledge.upsertKnowledgeSnippet);
  const createKnowledgeDocument = useMutation(api.ai.context.knowledge.createKnowledgeDocument);
  const [faqTitle, setFaqTitle] = useState("");
  const [faqContent, setFaqContent] = useState("");
  const [faqTags, setFaqTags] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentBody, setDocumentBody] = useState("");
  const [documentTags, setDocumentTags] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSavingFaq, setIsSavingFaq] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);

  async function handleFaqSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedFaqTitle = faqTitle.trim();
    const trimmedFaqContent = faqContent.trim();
    if (trimmedFaqTitle.length === 0 || trimmedFaqContent.length === 0) {
      return;
    }
    setIsSavingFaq(true);
    setStatus(null);
    try {
      await upsertKnowledgeSnippet({
        businessId: props.businessId,
        title: trimmedFaqTitle,
        content: trimmedFaqContent,
        tags: parseTags(faqTags),
        priority: 75,
        active: true,
      });
      setStatus(t("manager.savedFaq"));
      setFaqTitle("");
      setFaqContent("");
      setFaqTags("");
    } finally {
      setIsSavingFaq(false);
    }
  }

  async function handleDocumentSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedDocumentTitle = documentTitle.trim();
    const trimmedDocumentBody = documentBody.trim();
    if (trimmedDocumentTitle.length === 0 || trimmedDocumentBody.length === 0) {
      return;
    }
    setIsSavingDocument(true);
    setStatus(null);
    try {
      await createKnowledgeDocument({
        businessId: props.businessId,
        sourceType: "manual_text",
        title: trimmedDocumentTitle,
        mimeType: "text/plain",
        textContent: trimmedDocumentBody,
        tags: parseTags(documentTags),
        importance: 50,
      });
      setStatus(t("manager.queuedDocument"));
      setDocumentTitle("");
      setDocumentBody("");
      setDocumentTags("");
    } finally {
      setIsSavingDocument(false);
    }
  }

  return (
    <Card className="border border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>{t("manager.title")}</CardTitle>
            <CardDescription>{t("manager.description")}</CardDescription>
          </div>
          <Badge variant="outline">
            {t("manager.items", { count: snippets.length + documents.length })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <form className="flex flex-col gap-4" onSubmit={(event) => void handleFaqSubmit(event)}>
          <div className="flex items-center gap-2">
            <CircleQuestionMark className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{t("manager.faqSnippet")}</p>
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="knowledge-faq-title">
                {t("manager.placeholders.faqTitle")}
              </FieldLabel>
              <Input
                id="knowledge-faq-title"
                placeholder={t("manager.placeholders.faqTitle")}
                value={faqTitle}
                onChange={(event) => setFaqTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="knowledge-faq-content">
                {t("manager.placeholders.faqContent")}
              </FieldLabel>
              <Textarea
                id="knowledge-faq-content"
                placeholder={t("manager.placeholders.faqContent")}
                rows={3}
                value={faqContent}
                onChange={(event) => setFaqContent(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="knowledge-faq-tags">
                {t("manager.faqTagsPlaceholder")}
              </FieldLabel>
              <FieldDescription>{t("manager.faqTagsPlaceholder")}</FieldDescription>
              <Input
                id="knowledge-faq-tags"
                placeholder={t("manager.faqTagsPlaceholder")}
                value={faqTags}
                onChange={(event) => setFaqTags(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={
                isSavingFaq || faqTitle.trim().length === 0 || faqContent.trim().length === 0
              }
              type="submit"
            >
              {isSavingFaq ? t("manager.savingFaq") : t("manager.saveFaq")}
            </Button>
          </div>
        </form>
        <form className="flex flex-col gap-4 border-t border-border/70 pt-8" onSubmit={(event) => void handleDocumentSubmit(event)}>
          <div className="flex items-center gap-2">
            <BookOpenText className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{t("manager.manualDocument")}</p>
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="knowledge-document-title">
                {t("manager.placeholders.documentTitle")}
              </FieldLabel>
              <Input
                id="knowledge-document-title"
                placeholder={t("manager.placeholders.documentTitle")}
                value={documentTitle}
                onChange={(event) => setDocumentTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="knowledge-document-body">
                {t("manager.placeholders.documentBody")}
              </FieldLabel>
              <Textarea
                id="knowledge-document-body"
                placeholder={t("manager.placeholders.documentBody")}
                rows={5}
                value={documentBody}
                onChange={(event) => setDocumentBody(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="knowledge-document-tags">
                {t("manager.documentTagsPlaceholder")}
              </FieldLabel>
              <FieldDescription>{t("manager.documentTagsPlaceholder")}</FieldDescription>
              <Input
                id="knowledge-document-tags"
                placeholder={t("manager.documentTagsPlaceholder")}
                value={documentTags}
                onChange={(event) => setDocumentTags(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={
                isSavingDocument ||
                documentTitle.trim().length === 0 ||
                documentBody.trim().length === 0
              }
              type="submit"
            >
              {isSavingDocument ? t("manager.savingDocument") : t("manager.saveDocument")}
            </Button>
            {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
          </div>
        </form>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CircleQuestionMark className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{t("manager.currentFaqs")}</p>
          </div>
          {snippets.map((snippet) => (
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4" key={snippet._id}>
              <div className="flex items-start justify-between gap-3">
                <strong className="text-sm text-foreground">{snippet.title}</strong>
                {snippet.tags?.length ? <Badge variant="secondary">{snippet.tags[0]}</Badge> : null}
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{snippet.content}</p>
            </div>
          ))}
          {knowledge && snippets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              {t("manager.noFaqs")}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{t("manager.currentDocuments")}</p>
          </div>
          {documents.map((document) => (
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4" key={document._id}>
              <div className="flex items-start justify-between gap-3">
                <strong className="text-sm text-foreground">{document.title}</strong>
                <Badge variant="outline">{document.status}</Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {document.status}
                {document.textContent ? ` • ${document.textContent.slice(0, 120)}` : ""}
              </p>
            </div>
          ))}
          {knowledge && documents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              {t("manager.noDocuments")}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
