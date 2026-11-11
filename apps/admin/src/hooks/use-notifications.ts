"use client";

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BusinessNotificationItem } from "@lobbystack/shared";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { subscribeRealtimeQuery } from "@/lib/realtime-query";
import { requestJson } from "@/lib/request-json";

/** How often the bell checks for new items while the dashboard is open, on top of live updates and focus. */
const POLL_MS = 60_000;

type NotificationsResponse = { notifications: BusinessNotificationItem[] };

/** Marks the items read in a cached list. */
export function markReadInList(list: NotificationsResponse | undefined, ids: readonly string[] | "all"): NotificationsResponse | undefined {
  if (!list) return list;
  return { notifications: list.notifications.map((item) => (ids === "all" || ids.includes(item.id) ? { ...item, read: true } : item)) };
}

/**
 * The bell's notifications for the active business, kept fresh by the
 * realtime channel, a minute's poll and window focus, and the calls that
 * mark them read. The sidebar, the phone's Menu tab and the panel share
 * this one cached list.
 */
export function useNotifications() {
  const queryClient = useQueryClient();
  const { business } = useActiveBusiness();
  const businessId = business?.businessId;
  const key = ["notifications", businessId] as const;
  const notifications = useQuery({
    queryKey: key,
    queryFn: () => requestJson<NotificationsResponse>(`/api/notifications?businessId=${encodeURIComponent(businessId!)}`),
    enabled: Boolean(businessId),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!businessId) return;
    return subscribeRealtimeQuery(queryClient, businessId, ["notifications", businessId], ["notification.posted"]);
  }, [businessId, queryClient]);

  const markRead = useMutation({
    mutationFn: (ids: readonly string[] | "all") => requestJson<{ marked: number }>(`/api/notifications/read?businessId=${encodeURIComponent(businessId!)}`, {
      method: "POST",
      body: JSON.stringify(ids === "all" ? { all: true } : { ids }),
    }),
    // The dot goes at once; a failure puts the list back as the server has it.
    onMutate: (ids) => { queryClient.setQueryData<NotificationsResponse>(["notifications", businessId], (list) => markReadInList(list, ids)); },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications", businessId] }),
  });

  const items = notifications.data?.notifications ?? [];
  const unreadCount = items.filter((item) => !item.read).length;
  const { mutate } = markRead;
  const markAllRead = useCallback(() => mutate("all"), [mutate]);
  const markItemRead = useCallback((id: string) => mutate([id]), [mutate]);
  return { businessId, notifications, items, unreadCount, markAllRead, markItemRead };
}
