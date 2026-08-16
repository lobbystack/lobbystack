"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { selectActiveBusiness } from "@/lib/active-business";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";

type Business = { businessId: string; name: string; active: boolean; role: string };
type Document = { id: string; title: string; sourceType: string; status: string; processingProgress: number };
type Snippet = { id: string; title: string; content: string; active: boolean };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

async function checksum(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function OnboardingKnowledgeSurface() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [snippetTitle, setSnippetTitle] = useState("");
  const [snippetContent, setSnippetContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const documents = useQuery({ queryKey: ["onboarding-knowledge", business?.businessId], queryFn: () => requestJson<{ documents: Document[] }>(`/api/knowledge?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business) });
  const snippets = useQuery({ queryKey: ["onboarding-snippets", business?.businessId], queryFn: () => requestJson<{ snippets: Snippet[] }>(`/api/knowledge/snippets?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business) });
  const canMutate = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: ["onboarding-knowledge", business?.businessId] }); await queryClient.invalidateQueries({ queryKey: ["onboarding-snippets", business?.businessId] }); };
  const continueStep = useMutation({ mutationFn: () => requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: "greeting" }) }), onSuccess: () => router.push("/onboarding/greeting") });
  const skip = useMutation({ mutationFn: () => requestJson(`/api/onboarding/stage?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ to: "greeting" }) }), onSuccess: () => router.push("/onboarding/greeting") });
  const addSnippet = useMutation({ mutationFn: () => requestJson(`/api/knowledge/snippets?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ title: snippetTitle, content: snippetContent }) }), onSuccess: async () => { setSnippetTitle(""); setSnippetContent(""); await invalidate(); } });
  const upload = useMutation({ mutationFn: async (file: File) => { const fileChecksum = await checksum(file); const created = await requestJson<{ objectId: string; url: string; headers?: Record<string, string> }>("/api/uploads", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, purpose: "knowledge", fileName: file.name, contentType: file.type, length: file.size, checksum: fileChecksum }) }); const uploaded = await fetch(created.url, { method: "PUT", ...(created.headers ? { headers: created.headers } : {}), body: file }); if (!uploaded.ok) throw new Error("The file upload failed."); await requestJson("/api/uploads", { method: "PUT", body: JSON.stringify({ businessId: business!.businessId, objectId: created.objectId, length: file.size, contentType: file.type, checksum: fileChecksum }) }); }, onSuccess: invalidate });

  async function uploadFile(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; setError(null); try { await upload.mutateAsync(file); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to upload document."); } event.target.value = ""; }
  return <PageSurface eyebrow="Step 3 of 8" title="Review your knowledge" description="Add a source, upload a document, or save an explicit answer before continuing."><Card className="mx-auto max-w-3xl"><CardHeader><CardTitle>Imported sources</CardTitle><CardDescription>Review the sources that will inform answers. You can add more documents later from Agent settings.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><label className="flex min-h-24 cursor-pointer items-center justify-center rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground"><input className="sr-only" disabled={!canMutate || upload.isPending} onChange={(event) => void uploadFile(event)} type="file" accept="application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />{upload.isPending ? "Uploading..." : "Upload a document"}</label><div className="rounded-xl border p-4"><p className="font-medium">Add a quick answer</p><form className="mt-3 space-y-3" onSubmit={(event) => { event.preventDefault(); addSnippet.mutate(); }}><input aria-label="Knowledge snippet title" className="min-h-10 w-full rounded-xl border px-3 text-sm" disabled={!canMutate} value={snippetTitle} onChange={(event) => setSnippetTitle(event.target.value)} placeholder="Cancellation policy" required /><textarea aria-label="Knowledge snippet content" className="min-h-20 w-full rounded-xl border p-3 text-sm" disabled={!canMutate} value={snippetContent} onChange={(event) => setSnippetContent(event.target.value)} placeholder="Appointments can be canceled 24 hours ahead." required /><Button disabled={!canMutate || addSnippet.isPending} size="sm" type="submit">Save answer</Button></form></div></div>{error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}<div className="divide-y rounded-xl border">{documents.data?.documents.map((document) => <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between" key={document.id}><div><p className="font-medium">{document.title}</p><p className="text-sm capitalize text-muted-foreground">{document.sourceType} · {document.status === "processing" ? `${document.processingProgress}%` : document.status}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs capitalize text-muted-foreground">{document.status}</span></div>)}{snippets.data?.snippets.map((snippet) => <div className="flex flex-col gap-1 p-4" key={snippet.id}><p className="font-medium">{snippet.title}</p><p className="text-sm text-muted-foreground">{snippet.content}</p></div>)}{!documents.isLoading && !documents.data?.documents.length && !snippets.data?.snippets.length ? <p className="p-8 text-center text-sm text-muted-foreground">No sources added yet. You can continue and add knowledge later.</p> : null}</div><div className="flex flex-wrap justify-end gap-3"><Button disabled={!business || skip.isPending || continueStep.isPending} onClick={() => skip.mutate()} variant="ghost">Skip</Button><Button disabled={!business || continueStep.isPending || skip.isPending} onClick={() => continueStep.mutate()}>{continueStep.isPending ? "Continuing..." : "Continue"}</Button></div>{documents.isError || snippets.isError || continueStep.isError || skip.isError || addSnippet.isError ? <p className="text-sm text-destructive">{(documents.error ?? snippets.error ?? continueStep.error ?? skip.error ?? addSnippet.error)?.message}</p> : null}</CardContent></Card></PageSurface>;
}
