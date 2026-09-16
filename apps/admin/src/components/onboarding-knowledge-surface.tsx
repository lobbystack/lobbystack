"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, LoaderCircle, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { selectActiveBusiness } from "@/lib/active-business";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { FieldError } from "./ui/field";
import { Surface } from "./ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";

type Business = { businessId: string; name: string; active: boolean; role: string };
type Document = { id: string; title: string; sourceType: string; status: string; processingProgress: number; error?: string | null };
type UploadEntry = { id: string; fileName: string; status: "uploading" | "completed" | "error"; errorMessage?: string };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } }); if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed."); return await response.json() as T; }
async function checksum(file: File): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return btoa(String.fromCharCode(...new Uint8Array(digest))); }

export function OnboardingKnowledgeSurface() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [pastedText, setPastedText] = useState("");
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const documents = useQuery({ queryKey: ["onboarding-knowledge", business?.businessId], queryFn: () => requestJson<{ documents: Document[] }>(`/api/knowledge?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business) });
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: ["onboarding-knowledge", business?.businessId] }); };
  const addSnippet = useMutation({ mutationFn: (content: string) => requestJson(`/api/knowledge/snippets?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ title: t("knowledge.paste.defaultTitle"), content }) }) });
  const stage = useMutation({ mutationFn: () => requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: "greeting" }) }), onSuccess: () => router.push("/onboarding/greeting") });
  const upload = useMutation({ mutationFn: async (file: File) => { const digest = await checksum(file); const created = await requestJson<{ objectId: string; url: string; headers?: Record<string, string> }>("/api/uploads", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, purpose: "knowledge", fileName: file.name, contentType: file.type || "application/octet-stream", length: file.size, checksum: digest }) }); const uploaded = await fetch(created.url, { method: "PUT", ...(created.headers ? { headers: created.headers } : {}), body: file }); if (!uploaded.ok) throw new Error(t("knowledge.upload.failed")); await requestJson("/api/uploads", { method: "PUT", body: JSON.stringify({ businessId: business!.businessId, objectId: created.objectId, length: file.size, contentType: file.type || "application/octet-stream", checksum: digest }) }); } });
  const working = upload.isPending || addSnippet.isPending || stage.isPending;
  const stored = documents.data?.documents.filter((document) => document.sourceType === "upload") ?? [];

  async function uploadFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      if (file.size > 10 * 1024 * 1024) { setUploads((items) => [...items, { id, fileName: file.name, status: "error", errorMessage: t("knowledge.upload.tooLarge") }]); continue; }
      setUploads((items) => [...items, { id, fileName: file.name, status: "uploading" }]);
      try { await upload.mutateAsync(file); setUploads((items) => items.map((item) => item.id === id ? { ...item, status: "completed" } : item)); await invalidate(); setUploads((items) => items.filter((item) => item.id !== id)); }
      catch (cause) { setUploads((items) => items.map((item) => item.id === id ? { ...item, status: "error", errorMessage: cause instanceof Error ? cause.message : t("knowledge.upload.failed") } : item)); }
    }
  }

  async function continueOnboarding() {
    setError(null);
    try { if (pastedText.trim()) await addSnippet.mutateAsync(pastedText.trim()); await stage.mutateAsync(); }
    catch { setError(t("knowledge.continueFailed")); }
  }

  async function skip() { setError(null); try { await stage.mutateAsync(); } catch { setError(t("knowledge.skipFailed")); } }
  function drop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); setIsDragging(false); void uploadFiles(event.dataTransfer.files); }

  return <div className="flex flex-col gap-6"><Tabs onValueChange={(value) => setTab(value as "upload" | "paste")} value={tab}><TabsList className="w-full"><TabsTrigger value="upload">{t("knowledge.tabs.upload")}</TabsTrigger><TabsTrigger value="paste">{t("knowledge.tabs.paste")}</TabsTrigger></TabsList><TabsContent className="mt-4" value="upload"><input accept=".pdf,.docx,.txt,.md,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" id="onboarding-knowledge-file" multiple onChange={(event) => { void uploadFiles(event.target.files); if (fileInputRef.current) fileInputRef.current.value = ""; }} ref={fileInputRef} type="file" /><label className={cn("flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card p-10 text-center transition-colors", isDragging ? "border-foreground/60 bg-muted/40" : "border-border hover:border-foreground/40 hover:bg-muted/20")} htmlFor="onboarding-knowledge-file" onDragLeave={(event) => { event.preventDefault(); setIsDragging(false); }} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDrop={drop}><div className="flex size-12 items-center justify-center rounded-full bg-muted"><Upload aria-hidden="true" className="size-5 text-muted-foreground" /></div><div className="flex flex-col gap-1"><span className="text-base font-medium">{t("knowledge.upload.headline")}</span><span className="text-sm text-muted-foreground">{t("knowledge.upload.formats")}</span></div></label>{stored.length || uploads.length ? <ul className="mt-4 flex flex-col gap-2">{stored.map((document) => <KnowledgeFile key={document.id} error={document.error ?? undefined} fileName={document.title} status={document.status === "processing" || document.status === "queued" ? "uploading" : document.status === "error" ? "error" : "completed"} />)}{uploads.map((entry) => <KnowledgeFile key={entry.id} error={entry.errorMessage} fileName={entry.fileName} onRemove={() => setUploads((items) => items.filter((item) => item.id !== entry.id))} status={entry.status} />)}</ul> : null}</TabsContent><TabsContent className="mt-4" value="paste"><Textarea autoFocus className="min-h-48 rounded-xl" id="onboarding-knowledge-paste" onChange={(event) => setPastedText(event.target.value)} placeholder={t("knowledge.paste.placeholder")} value={pastedText} /><p className="mt-2 text-xs text-muted-foreground">{t("knowledge.paste.hint")}</p></TabsContent></Tabs>{error ? <FieldError>{error}</FieldError> : null}<Button className="h-11 w-full" disabled={!business || working} onClick={() => void continueOnboarding()} type="button">{working ? <><LoaderCircle className="size-4 animate-spin" />{t("knowledge.continuing")}</> : t("knowledge.continue")}</Button><button className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50" disabled={!business || working} onClick={() => void skip()} type="button">{stage.isPending ? t("knowledge.skipping") : t("knowledge.skip")}</button></div>;
}

function KnowledgeFile({ error, fileName, onRemove, status }: { error: string | undefined; fileName: string; onRemove?: () => void; status: UploadEntry["status"] }) {
  return <li><Surface className="flex w-full items-center gap-3 px-4 py-3"><FileText aria-hidden="true" className="size-4 text-muted-foreground" /><div className="flex flex-1 flex-col"><span className="text-sm font-medium">{fileName}</span>{status === "error" && error ? <span className="text-xs text-destructive">{error}</span> : null}</div>{status === "uploading" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-muted-foreground" /> : null}{status === "completed" ? <CheckCircle2 aria-hidden="true" className="size-4" /> : null}{onRemove ? <Button aria-label="Remove" onClick={onRemove} size="icon-sm" type="button" variant="ghost"><X className="size-4" /></Button> : null}</Surface></li>;
}
