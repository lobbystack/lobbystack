"use client";

import { useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

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
  serviceId?: string;
  /** The agent can read these to a verified caller. */
  notes?: string | null;
  /** Staff only: never sent to the agent, its snapshot or the customer. */
  internalNotes?: string | null;
};

/** A business closure (no staffId) or an employee's time off, as the calendar shows it. */
export type TimeOff = { id: string; staffId: string | null; staffName: string | null; startsAt: string; endsAt: string; name: string; note: string | null };

export type OpeningHours = { timezone: string; hours: Array<{ dayOfWeek: number; openMinutes: number; closeMinutes: number }> };

export const isCancelled = (appointment: Pick<Appointment, "status">) => appointment.status === "canceled" || appointment.status === "cancelled";

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

const range = (from: string, to: string) => `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

/**
 * Every appointment that overlaps [from, to), cancellations included, for the
 * calendar. It sits under the ["appointments", businessId] key, so booking,
 * moving, cancelling and live updates refresh it with the list. While the
 * next range loads, the last one stays on screen.
 */
export function useAppointmentsBetween(businessId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ["appointments", businessId, "range", from, to],
    queryFn: () => requestJson<{ appointments: Appointment[] }>(`/api/appointments?businessId=${encodeURIComponent(businessId!)}&${range(from, to)}`),
    enabled: Boolean(businessId),
    placeholderData: keepPreviousData,
  });
}

/** The business's closures and employees' time off that overlap [from, to). */
export function useTimeOffBetween(businessId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ["time-off", businessId, from, to],
    queryFn: () => requestJson<{ timeOff: TimeOff[] }>(`/api/time-off?businessId=${encodeURIComponent(businessId!)}&${range(from, to)}`),
    enabled: Boolean(businessId),
    placeholderData: keepPreviousData,
  });
}

/** The business's weekly hours, from the same cache entry as the hours editor. */
export function useOpeningHours(businessId: string | undefined) {
  return useQuery({
    queryKey: ["business-hours", businessId],
    queryFn: () => requestJson<OpeningHours>(`/api/hours?businessId=${encodeURIComponent(businessId!)}`),
    enabled: Boolean(businessId),
  });
}
