"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { RealtimeEvent } from "@lobbystack/contracts";

type RealtimeMessage = {
  event: RealtimeEvent;
};

function applyRealtimeEvent(queryClient: ReturnType<typeof useQueryClient>, message: RealtimeMessage) {
  const { event } = message;
  const businessId = event.payload.businessId;

  switch (event.type) {
    case "call.started":
    case "call.updated":
    case "call.completed":
      void queryClient.invalidateQueries({ queryKey: ["rpc", "voice.runtime.listRecentCalls"] });
      void queryClient.invalidateQueries({ queryKey: ["rpc", "dashboard.overview.getHomeSummary"] });
      break;
    case "transcript.upserted":
    case "recording.available":
      void queryClient.invalidateQueries({ queryKey: ["rpc", "voice.runtime.getCallTranscript"] });
      void queryClient.invalidateQueries({ queryKey: ["rpc", "voice.runtime.getCallForDashboard"] });
      break;
    case "message.upserted":
    case "message.deliveryUpdated":
    case "conversation.updated":
      void queryClient.invalidateQueries({ queryKey: ["rpc", "dashboard.messages.listConversationSummaries"] });
      void queryClient.invalidateQueries({ queryKey: ["rpc", "dashboard.messages.getConversationThread"] });
      break;
    case "appointment.created":
    case "appointment.updated":
      void queryClient.invalidateQueries({ queryKey: ["rpc", "dashboard.overview.getHomeSummary"] });
      break;
    case "knowledge.progressed":
    case "document.progressed":
      void queryClient.invalidateQueries({ queryKey: ["rpc", "ai.context.knowledge.listKnowledge"] });
      break;
    default:
      void queryClient.invalidateQueries({ queryKey: ["rpc"] });
      break;
  }

  void queryClient.invalidateQueries({ queryKey: ["business", businessId] });
}

export function useBusinessRealtime(businessId: string | undefined): void {
  const queryClient = useQueryClient();
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!businessId) {
      return;
    }

    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(businessId)}`);
    sourceRef.current = source;

    source.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as RealtimeMessage;
        applyRealtimeEvent(queryClient, message);
      } catch {
        // Ignore malformed events.
      }
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [businessId, queryClient]);
}
