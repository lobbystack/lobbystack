"use client";

import { Mic, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Internal test surface for the GPT-Live prototype. English only on purpose:
// it is behind LIVE_PROTOTYPE_ENABLED and will be removed after the prototype.

type Line = { role: "caller" | "receptionist"; text: string };
type Timing = {
  delegationId: string;
  callerSilentToDelegationMs?: number;
  delegationToAnswerMs?: number;
  answerToSpeechMs?: number;
};
type Status = "idle" | "connecting" | "live" | "ending";

type LiveEvent =
  | { type: "session.started"; session: { id: string } }
  | { type: "session.closed"; reason: string }
  | { type: "session.input_transcript.delta" | "session.output_transcript.delta"; delta: string }
  | { type: "session.delegation.created"; delegation: { id: string } }
  | { type: "session.commentary.appended"; client_event_id?: string }
  | { type: "error"; error?: { message?: string } };

function formatMs(value: number | undefined): string {
  return value === undefined ? "…" : `${(value / 1000).toFixed(2)} s`;
}

export function LivePrototypeSurface() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connectMs, setConnectMs] = useState<number>();
  const [serverTimings, setServerTimings] = useState<{ sessionCreatedMs: number; workerAttachMs: number }>();
  const [lines, setLines] = useState<Line[]>([]);
  const [timings, setTimings] = useState<Timing[]>([]);
  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  // Wall-clock marks for the latency table, kept outside React state.
  const marks = useRef({ lastCallerDeltaAt: 0, createdAt: new Map<string, number>(), answeredAt: new Map<string, number>(), awaitingSpeech: null as string | null });

  const cleanup = useCallback(() => {
    microphone.current?.getTracks().forEach((track) => track.stop());
    channel.current?.close();
    peer.current?.close();
    peer.current = null;
    channel.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const updateTiming = (delegationId: string, patch: Partial<Timing>) => {
    setTimings((current) => current.map((item) => (item.delegationId === delegationId ? { ...item, ...patch } : item)));
  };

  const appendLine = (role: Line["role"], delta: string) => {
    setLines((current) => {
      const last = current.at(-1);
      if (last?.role === role) return [...current.slice(0, -1), { role, text: last.text + delta }];
      return [...current, { role, text: delta }];
    });
  };

  const onEvent = (event: LiveEvent, startedAt: number) => {
    const now = performance.now();
    const state = marks.current;
    switch (event.type) {
      case "session.started":
        setConnectMs(Math.round(now - startedAt));
        setStatus("live");
        break;
      case "session.closed":
        cleanup();
        break;
      case "session.input_transcript.delta":
        state.lastCallerDeltaAt = now;
        appendLine("caller", event.delta);
        break;
      case "session.output_transcript.delta":
        appendLine("receptionist", event.delta);
        if (state.awaitingSpeech) {
          const answeredAt = state.answeredAt.get(state.awaitingSpeech);
          if (answeredAt) updateTiming(state.awaitingSpeech, { answerToSpeechMs: Math.round(now - answeredAt) });
          state.awaitingSpeech = null;
        }
        break;
      case "session.delegation.created":
        state.createdAt.set(event.delegation.id, now);
        setTimings((current) => [...current, {
          delegationId: event.delegation.id,
          ...(state.lastCallerDeltaAt ? { callerSilentToDelegationMs: Math.round(now - state.lastCallerDeltaAt) } : {}),
        }]);
        break;
      case "session.commentary.appended": {
        const delegationId = event.client_event_id?.replace(/^answer_/, "");
        const createdAt = delegationId ? state.createdAt.get(delegationId) : undefined;
        if (!delegationId || !createdAt) break;
        state.answeredAt.set(delegationId, now);
        state.awaitingSpeech = delegationId;
        updateTiming(delegationId, { delegationToAnswerMs: Math.round(now - createdAt) });
        break;
      }
      case "error":
        setError(event.error?.message ?? "The live session reported an error.");
        break;
    }
  };

  const start = async () => {
    setError(null);
    setLines([]);
    setTimings([]);
    setConnectMs(undefined);
    setServerTimings(undefined);
    marks.current = { lastCallerDeltaAt: 0, createdAt: new Map(), answeredAt: new Map(), awaitingSpeech: null };
    setStatus("connecting");
    const startedAt = performance.now();
    try {
      const connection = new RTCPeerConnection();
      peer.current = connection;
      connection.addEventListener("track", (event) => {
        if (audio.current) audio.current.srcObject = new MediaStream([event.track]);
      });
      microphone.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of microphone.current.getAudioTracks()) connection.addTrack(track, microphone.current);

      const events = connection.createDataChannel("oai-events");
      channel.current = events;
      events.addEventListener("message", ({ data }) => onEvent(JSON.parse(String(data)) as LiveEvent, startedAt));

      await connection.setLocalDescription(await connection.createOffer());
      const response = await fetch("/api/live/prototype/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sdp: connection.localDescription?.sdp }),
      });
      const result = await response.json() as { sdp?: string; error?: string; timings?: { sessionCreatedMs: number; workerAttachMs: number } };
      if (!response.ok || !result.sdp) throw new Error(result.error ?? "Could not start the live session.");
      if (result.timings) setServerTimings(result.timings);
      await connection.setRemoteDescription({ type: "answer", sdp: result.sdp });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      cleanup();
    }
  };

  const stop = () => {
    setStatus("ending");
    if (channel.current?.readyState === "open") channel.current.send(JSON.stringify({ type: "session.close" }));
    setTimeout(cleanup, 5_000);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>GPT-Live prototype</CardTitle>
          <CardDescription>
            Talk to your agent through GPT-Live. Ask for opening hours, an appointment time, or leave a message, then check how long each answer took.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            {status === "idle" ? (
              <Button onClick={() => void start()}><Mic /> Start test call</Button>
            ) : (
              <Button variant="destructive" onClick={stop} disabled={status !== "live"}><PhoneOff /> {status === "connecting" ? "Connecting…" : status === "ending" ? "Ending…" : "End call"}</Button>
            )}
            <span className="text-sm text-muted-foreground">
              Connected in {formatMs(connectMs)}
              {serverTimings ? ` (session ${formatMs(serverTimings.sessionCreatedMs)}, worker attach ${formatMs(serverTimings.workerAttachMs)})` : ""}
            </span>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <audio ref={audio} autoPlay />
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Answer timing</CardTitle>
          <CardDescription>One row each time GPT-Live hands a request to the agent core.</CardDescription>
        </CardHeader>
        <CardContent>
          {timings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1">#</th><th>Caller stopped → handed off</th><th>Handed off → answer ready</th><th>Answer ready → speaking</th></tr>
              </thead>
              <tbody>
                {timings.map((timing, index) => (
                  <tr key={timing.delegationId} className="border-t">
                    <td className="py-1">{index + 1}</td>
                    <td>{formatMs(timing.callerSilentToDelegationMs)}</td>
                    <td>{formatMs(timing.delegationToAnswerMs)}</td>
                    <td>{formatMs(timing.answerToSpeechMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader><CardTitle>Transcript</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {lines.length === 0 ? <p className="text-muted-foreground">Nothing said yet.</p> : lines.map((line, index) => (
            <p key={index}><span className="font-medium">{line.role === "caller" ? "You" : "Agent"}:</span> {line.text}</p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
