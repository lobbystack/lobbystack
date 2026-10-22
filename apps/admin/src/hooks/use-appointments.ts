"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { subscribeRealtimeQuery } from "@/lib/realtime-query";
import { requestJson } from "@/lib/request-json";

export type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: string;
  sourceChannel: string;
  calendarSyncState: string;
  createdAt?: string;
  staffId?: string;
  contactName: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  serviceName: string;
  staffName: string;
  /** Null for the default staff member that stands for the business itself. */
  employeeName?: string | null;
};

/** Ended appointments stay listed for a while, faded and without a Cancel button. */
export function hasEnded(appointment: Pick<Appointment, "endsAt">, now = Date.now()): boolean {
  return Date.parse(appointment.endsAt) < now;
}

/** Upcoming and recently ended appointments, kept live: the sidebar badge, Home and the appointments page share this one cached list. */
export function useAppointments() {
  const queryClient = useQueryClient();
  const { businesses, business } = useActiveBusiness();
  const businessId = business?.businessId;
  const appointments = useQuery({
    queryKey: ["appointments", businessId],
    queryFn: () => requestJson<{ appointments: Appointment[] }>(`/api/appointments?businessId=${encodeURIComponent(businessId!)}`),
    enabled: Boolean(businessId),
  });

  useEffect(() => {
    if (!businessId) return;
    return subscribeRealtimeQuery(queryClient, businessId, ["appointments", businessId], ["appointment.updated"]);
  }, [businessId, queryClient]);

  return { businesses, business, appointments };
}
