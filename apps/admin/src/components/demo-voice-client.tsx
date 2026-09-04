"use client";

import { Mic, Phone, PhoneOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { webCallEndpoint } from "@/lib/web-call-endpoint";
import { Button } from "./ui/button";

type Status = "idle" | "requesting" | "connecting" | "connected" | "ending" | "error";

function visitorId(): string {
  const key = "lobbystack.prospectDemoVisitorId";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  window.localStorage.setItem(key, value);
  return value;
}

export function DemoVoiceClient({ businessSlug, token }: { businessSlug: string; token: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const cleanup = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
  };

  const endCall = async () => {
    setStatus("ending");
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    if (sessionId) void fetch(`${webCallEndpoint}/${encodeURIComponent(sessionId)}/end`, { method: "POST", keepalive: true }).catch(() => undefined);
    cleanup();
    setStatus("idle");
  };

  useEffect(() => () => {
    const sessionId = sessionIdRef.current;
    if (sessionId) void fetch(`${webCallEndpoint}/${encodeURIComponent(sessionId)}/end`, { method: "POST", keepalive: true }).catch(() => undefined);
    cleanup();
  }, []);

  const startCall = async () => {
    setError(null);
    setStatus("requesting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") throw new Error("This browser does not support microphone calls.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      setStatus("connecting");
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));
      peer.ontrack = (event) => {
        const remote = event.streams[0];
        if (remote && audioRef.current) {
          audioRef.current.srcObject = remote;
          void audioRef.current.play().catch(() => undefined);
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") setStatus("connected");
        if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
          cleanup();
          setError("The voice connection ended unexpectedly. Please try again.");
          setStatus("error");
        }
      };
      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      await peer.setLocalDescription(offer);
      const response = await fetch(webCallEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessSlug, prospectDemoToken: token, visitorId: visitorId(), widgetId: "lobbystack-prospect-demo", sdp: offer.sdp, pageUrl: `${window.location.origin}${window.location.pathname}${window.location.search}` }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "The receptionist is unavailable right now.");
      }
      const answer = await response.json() as { sessionId: string; sdp: string };
      sessionIdRef.current = answer.sessionId;
      await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    } catch (cause) {
      cleanup();
      setError(cause instanceof Error ? cause.message : "The call could not be started.");
      setStatus("error");
    }
  };

  const active = status === "connecting" || status === "connected";
  return <div className="rounded-xl border bg-slate-950 p-6 text-center text-white">
    <audio ref={audioRef} autoPlay playsInline />
    <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-teal-500/20 ring-1 ring-teal-300/30">
      {status === "connected" ? <Mic className="size-9 text-teal-200" aria-hidden="true" /> : <Phone className="size-9 text-teal-200" aria-hidden="true" />}
    </div>
    <p className="mb-4 text-sm text-slate-300" role="status">{status === "requesting" ? "Allow microphone access to continue." : status === "connecting" ? "Connecting to the receptionist..." : status === "connected" ? "You are speaking with the receptionist." : "Start a live voice conversation from your browser."}</p>
    {active ? <Button variant="destructive" onClick={() => void endCall()}><PhoneOff className="size-4" />End call</Button> : <Button onClick={() => void startCall()} disabled={status === "requesting" || status === "ending"}><Phone className="size-4" />Start voice demo</Button>}
    {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
  </div>;
}
