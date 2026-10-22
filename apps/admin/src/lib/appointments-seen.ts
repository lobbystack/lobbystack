"use client";

import { useEffect, useSyncExternalStore } from "react";

const SEEN_EVENT = "lobbystack:appointments-seen";
const storageKey = (businessId: string) => `lobbystack:appointments-seen:${businessId}`;

/** When the owner last looked at the appointments page, in milliseconds, or null if they never have. */
export function readAppointmentsSeenAt(businessId: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(storageKey(businessId)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function markAppointmentsSeen(businessId: string, at = Date.now()): void {
  try {
    window.localStorage.setItem(storageKey(businessId), String(at));
  } catch {
    // Storage is blocked; the badge resets on the next page load.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/** Appointments booked after the owner last looked. */
export function countNewAppointments(rows: ReadonlyArray<{ createdAt?: string }>, seenAt: number | null): number {
  if (seenAt === null) return 0;
  return rows.filter((row) => row.createdAt !== undefined && Date.parse(row.createdAt) > seenAt).length;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(SEEN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SEEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The number of new bookings to badge. The first visit starts counting from
 * now, so existing appointments don't all show up as new.
 */
export function useNewAppointmentCount(businessId: string | undefined, rows: ReadonlyArray<{ createdAt?: string }>): number {
  const seenAt = useSyncExternalStore(subscribe, () => (businessId ? readAppointmentsSeenAt(businessId) : null), () => null);
  useEffect(() => {
    if (businessId && readAppointmentsSeenAt(businessId) === null) markAppointmentsSeen(businessId);
  }, [businessId]);
  return countNewAppointments(rows, seenAt);
}
