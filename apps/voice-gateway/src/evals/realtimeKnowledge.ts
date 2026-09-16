import WebSocket from "ws";
import { buildVoiceSystemPrompt, VOICE_GROUNDING_VERSION } from "@lobbystack/ai";
import { demoSnapshot } from "@lobbystack/shared";
import { evaluationSources, type VoiceKnowledgeCase } from "../../../../packages/domain/src/evals/voiceKnowledge.v1";
import { createWebRealtimeToolDefinitions } from "../realtime/toolDefinitions";

export type EvaluationKnowledgeMode = "full" | "retrieval" | "hybrid";
export type EvaluationEvidence = { matches: Array<{ content: string; documentId: string; title: string }>; outcome: string; mode: string; durationMs: number };

// Text-only probes isolate factual grounding from speech recognition. They are not audio acceptance tests.
export async function evaluateRealtimeKnowledge(input: {
  apiKey: string; model: string; mode: EvaluationKnowledgeMode; test: VoiceKnowledgeCase;
  lookup: (query: string) => Promise<EvaluationEvidence>;
  inputAudio?: Buffer;
  voice?: string;
}): Promise<{ answer: string; lookupCount: number; durationMs: number; inputTokens: number; outputTokens: number; promptVersion: string; supportedDocumentIds: string[]; audio?: Buffer; evidenceAnswerStartMs?: number }> {
  const sources = evaluationSources.filter(source => source.tenant === input.test.tenant);
  const snapshot = {
    ...demoSnapshot, displayName: input.test.tenant === "hec" ? "HEC" : "Maple Workshop", summary: "", greeting: "Hello, how can I help?", voiceInstructions: "Answer concisely using the available business facts.",
    services: [], rules: [], hours: [], knowledgeSnippets: input.mode === "full" ? sources.map(source => ({ id: source.id, title: source.title, content: source.text, tags: [], priority: 0 })) : [],
    knowledgeDigest: input.mode === "hybrid" ? sources.map(source => JSON.stringify({ title: source.title, url: source.url, revision: source.revision })).join("\n") : "",
    bookingPolicy: "Do not make bookings during this evaluation.",
  };
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(input.model)}`, { headers: { Authorization: `Bearer ${input.apiKey}` } });
    let settled = false, lookupCount = 0, inputTokens = 0, outputTokens = 0;
    let greetingPending = Boolean(input.inputAudio), questionEndedAt = startedAt;
    let evidenceAnswerStartMs: number | undefined;
    const audioChunks: Buffer[] = [];
    const supportedDocumentIds = new Set<string>();
    const finish = (error?: Error, answer = "") => {
      if (settled) return;
      settled = true; clearTimeout(timer); socket.close();
      if (error) reject(error);
      else resolve({ answer, lookupCount, durationMs: performance.now() - startedAt, inputTokens, outputTokens, promptVersion: VOICE_GROUNDING_VERSION, supportedDocumentIds: [...supportedDocumentIds], ...(audioChunks.length ? { audio: Buffer.concat(audioChunks) } : {}), ...(evidenceAnswerStartMs !== undefined ? { evidenceAnswerStartMs } : {}) });
    };
    const timer = setTimeout(() => finish(new Error("Realtime evaluation timed out")), 25000);
    const send = (value: unknown) => socket.send(JSON.stringify(value));
    socket.on("error", () => finish(new Error("Realtime evaluation connection failed")));
    socket.on("close", () => { if (!settled) finish(new Error("Realtime evaluation closed before completion")); });
    socket.on("open", () => send({ type: "session.update", session: { type: "realtime", output_modalities: [input.inputAudio ? "audio" : "text"], ...(input.inputAudio ? { audio: { input: { format: { type: "audio/pcm", rate: 24000 }, turn_detection: null, noise_reduction: { type: "far_field" } }, output: { format: { type: "audio/pcm", rate: 24000 }, voice: input.voice ?? "marin" } } } : {}), instructions: buildVoiceSystemPrompt(snapshot), tools: createWebRealtimeToolDefinitions().filter(tool => tool.name === "searchKnowledge") } }));
    socket.on("message", async raw => {
      try {
        const event = JSON.parse(raw.toString());
        if (event.type === "error") return finish(new Error(`Realtime evaluation rejected: ${String(event.error?.code ?? "unknown")}`));
        if (event.type === "session.updated") {
          if (input.inputAudio) {
            send({ type: "response.create", response: { instructions: `Say the configured greeting once: ${snapshot.greeting}`, tool_choice: "none" } });
            return;
          }
          send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: [input.test.history, input.test.question].filter(Boolean).join("\n") }] } });
          send({ type: "response.create" });
        }
        if (event.type === "response.output_audio.delta" && !greetingPending) {
          audioChunks.push(Buffer.from(event.delta, "base64"));
          if (supportedDocumentIds.size && evidenceAnswerStartMs === undefined) evidenceAnswerStartMs = performance.now() - questionEndedAt;
        }
        if (event.type !== "response.done") return;
        inputTokens += event.response?.usage?.input_tokens ?? 0;
        outputTokens += event.response?.usage?.output_tokens ?? 0;
        if (event.response?.status !== "completed") return finish(new Error("Realtime evaluation response did not complete"));
        if (greetingPending && input.inputAudio) {
          greetingPending = false;
          send({ type: "input_audio_buffer.append", audio: input.inputAudio.toString("base64") });
          send({ type: "input_audio_buffer.commit" });
          questionEndedAt = performance.now();
          send({ type: "response.create" });
          return;
        }
        const output = event.response.output as Array<{ type: string; call_id?: string; arguments?: string; content?: Array<{ text?: string; transcript?: string }> }>;
        const calls = output.filter(item => item.type === "function_call");
        if (calls.length) {
          for (const call of calls) {
            lookupCount += 1;
            const args = JSON.parse(call.arguments ?? "{}");
            const evidence = lookupCount <= 2 ? await input.lookup(String(args.query ?? "")) : { matches: [], outcome: "empty", mode: "refinement_limit", durationMs: 0 };
            evidence.matches.forEach(match => supportedDocumentIds.add(match.documentId));
            send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(evidence) } });
          }
          if (lookupCount > 3) return finish(new Error("Realtime evaluation exceeded refinement limit"));
          send({ type: "response.create" });
          return;
        }
        finish(undefined, output.flatMap(item => item.content ?? []).map(content => content.text ?? content.transcript ?? "").join("\n"));
      } catch { finish(new Error("Realtime evaluation processing failed")); }
    });
  });
}
