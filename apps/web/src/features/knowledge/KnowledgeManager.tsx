import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

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
  const knowledge = useQuery(api.ai.context.knowledge.listKnowledge, {
    businessId: props.businessId,
  });
  const snippets = (knowledge?.snippets ?? []) as Array<Doc<"knowledge_snippets">>;
  const documents = (knowledge?.documents ?? []) as Array<Doc<"knowledge_documents">>;
  const upsertKnowledgeSnippet = useMutation(api.ai.context.knowledge.upsertKnowledgeSnippet);
  const createKnowledgeDocument = useMutation(api.ai.context.knowledge.createKnowledgeDocument);
  const [faqTitle, setFaqTitle] = useState("Do you take same-day appointments?");
  const [faqContent, setFaqContent] = useState(
    "Yes, if there is open capacity. The receptionist should check availability before confirming.",
  );
  const [faqTags, setFaqTags] = useState("faq,booking");
  const [documentTitle, setDocumentTitle] = useState("Clinic Policies");
  const [documentBody, setDocumentBody] = useState(
    "Patients should arrive 10 minutes early. Bring photo ID and insurance information when applicable.",
  );
  const [documentTags, setDocumentTags] = useState("policy,intake");
  const [status, setStatus] = useState<string | null>(null);
  const [isSavingFaq, setIsSavingFaq] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);

  async function handleFaqSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSavingFaq(true);
    setStatus(null);
    try {
      await upsertKnowledgeSnippet({
        businessId: props.businessId,
        title: faqTitle,
        content: faqContent,
        tags: parseTags(faqTags),
        priority: 75,
        active: true,
      });
      setStatus("Saved FAQ snippet.");
      setFaqTitle("");
      setFaqContent("");
      setFaqTags("");
    } finally {
      setIsSavingFaq(false);
    }
  }

  async function handleDocumentSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSavingDocument(true);
    setStatus(null);
    try {
      await createKnowledgeDocument({
        businessId: props.businessId,
        sourceType: "manual_text",
        title: documentTitle,
        mimeType: "text/plain",
        textContent: documentBody,
        tags: parseTags(documentTags),
        importance: 50,
      });
      setStatus("Queued document for indexing.");
      setDocumentTitle("");
      setDocumentBody("");
      setDocumentTags("");
    } finally {
      setIsSavingDocument(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Knowledge Base</CardTitle>
        <CardDescription>
          Add FAQs and long-form docs. Convex indexes them for preview and SMS, then rolls
          a compact digest into the voice snapshot.
        </CardDescription>
      </CardHeader>
      <CardContent className="stack">
        <form className="stack" onSubmit={(event) => void handleFaqSubmit(event)}>
          <span className="kpi-label">FAQ Snippet</span>
          <input
            className="text-input"
            value={faqTitle}
            onChange={(event) => setFaqTitle(event.target.value)}
          />
          <textarea
            className="text-area"
            rows={3}
            value={faqContent}
            onChange={(event) => setFaqContent(event.target.value)}
          />
          <input
            className="text-input"
            placeholder="faq,booking"
            value={faqTags}
            onChange={(event) => setFaqTags(event.target.value)}
          />
          <div className="inline-actions">
            <Button disabled={isSavingFaq} type="submit">
              {isSavingFaq ? "Saving..." : "Add FAQ"}
            </Button>
          </div>
        </form>
        <form className="stack section-divider" onSubmit={(event) => void handleDocumentSubmit(event)}>
          <span className="kpi-label">Manual Document</span>
          <input
            className="text-input"
            value={documentTitle}
            onChange={(event) => setDocumentTitle(event.target.value)}
          />
          <textarea
            className="text-area"
            rows={5}
            value={documentBody}
            onChange={(event) => setDocumentBody(event.target.value)}
          />
          <input
            className="text-input"
            placeholder="policy,intake"
            value={documentTags}
            onChange={(event) => setDocumentTags(event.target.value)}
          />
          <div className="inline-actions">
            <Button disabled={isSavingDocument} type="submit">
              {isSavingDocument ? "Queue document..." : "Add document"}
            </Button>
            {status ? <span className="status-note">{status}</span> : null}
          </div>
        </form>
        <div className="mini-list">
          <span className="kpi-label">Current FAQs</span>
          {snippets.map((snippet) => (
            <div className="mini-list-item" key={snippet._id}>
              <strong>{snippet.title}</strong>
              <span className="muted">{snippet.content}</span>
            </div>
          ))}
          {knowledge && snippets.length === 0 ? (
            <span className="muted">No FAQ snippets yet.</span>
          ) : null}
        </div>
        <div className="mini-list">
          <span className="kpi-label">Current Documents</span>
          {documents.map((document) => (
            <div className="mini-list-item" key={document._id}>
              <strong>{document.title}</strong>
              <span className="muted">
                {document.status}
                {document.textContent ? ` • ${document.textContent.slice(0, 120)}` : ""}
              </span>
            </div>
          ))}
          {knowledge && documents.length === 0 ? (
            <span className="muted">No documents yet.</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
