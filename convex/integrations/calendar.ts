import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMembership } from "../lib/auth";
import { workflowManager } from "../lib/components";

export const CALENDAR_RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000;
const CALENDAR_SYNC_RETRY_DELAY_MS = CALENDAR_RECONCILIATION_INTERVAL_MS;
const CALENDAR_SYNC_PENDING_TIMEOUT_MS = 15 * 60 * 1000;
const CALENDAR_SYNC_SYNCING_TIMEOUT_MS = 15 * 60 * 1000;

const calendarSyncStateValidator = v.union(
  v.literal("not_required"),
  v.literal("pending"),
  v.literal("syncing"),
  v.literal("synced"),
  v.literal("failed"),
  v.literal("drifted"),
  v.literal("synced_mock"),
);

type CalendarSyncState =
  | "not_required"
  | "pending"
  | "syncing"
  | "synced"
  | "failed"
  | "drifted"
  | "synced_mock";

type NormalizedCalendarSyncState =
  | "not_required"
  | "pending"
  | "syncing"
  | "synced"
  | "failed"
  | "drifted";

type AppointmentSyncContext = {
  appointment: Doc<"appointments">;
  serviceName: string;
  contactName?: string;
  contactPhone: string;
  hasConnectedCalendar: boolean;
  selectedConnectionId?: Id<"calendar_connections">;
  selectedCalendarId?: string;
};

type CalendarConnectionState = {
  hasConnectedCalendar: boolean;
  connectionCount: number;
  selectedConnectionId?: Id<"calendar_connections">;
  selectedCalendarId?: string;
};

type CalendarReconciliationResult = {
  businessId: Id<"businesses">;
  processed: number;
  retried: number;
  failed: number;
  drifted: number;
  recovered: number;
  issuesOpened: number;
};

type CalendarReconciliationSummary = {
  businessId: Id<"businesses">;
  counts: Record<NormalizedCalendarSyncState, number>;
  openIssueCount: number;
};

function normalizeCalendarSyncState(
  state: CalendarSyncState,
): NormalizedCalendarSyncState {
  return state === "synced_mock" ? "synced" : state;
}

function buildMockExternalEventId(
  connectionId: Id<"calendar_connections">,
  appointmentId: Id<"appointments">,
): string {
  return `mock:${String(connectionId)}:${String(appointmentId)}`;
}

function getRetryTime(nowIso: string): string {
  return new Date(Date.parse(nowIso) + CALENDAR_SYNC_RETRY_DELAY_MS).toISOString();
}

function isPastDue(targetIso: string | undefined, nowMs: number): boolean {
  if (!targetIso) {
    return false;
  }

  return Date.parse(targetIso) <= nowMs;
}

function shouldRetrySync(targetIso: string | undefined, nowMs: number): boolean {
  return targetIso === undefined || isPastDue(targetIso, nowMs);
}

function isStale(
  referenceIso: string | undefined,
  nowMs: number,
  thresholdMs: number,
): boolean {
  if (!referenceIso) {
    return false;
  }

  return nowMs - Date.parse(referenceIso) >= thresholdMs;
}

function buildCalendarSyncIssueBody(input: {
  appointment: Doc<"appointments">;
  serviceName: string;
  contactName?: string;
  contactPhone: string;
}): string {
  const lines = [
    `Appointment: ${input.appointment.startsAt}`,
    `Service: ${input.serviceName}`,
    `Contact: ${input.contactName ?? "Unknown"} (${input.contactPhone})`,
    `Sync state: ${normalizeCalendarSyncState(input.appointment.calendarSyncState)}`,
  ];

  if (input.appointment.calendarLastSyncError) {
    lines.push(`Last error: ${input.appointment.calendarLastSyncError}`);
  }

  return lines.join("\n");
}

async function loadConnectedCalendarConnections(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  businessId: Id<"businesses">,
): Promise<Array<Doc<"calendar_connections">>> {
  return await ctx.db
    .query("calendar_connections")
    .withIndex("by_business_id_and_status", (q) =>
      q.eq("businessId", businessId).eq("status", "connected"),
    )
    .collect();
}

function selectPreferredCalendarConnection(
  connections: Array<Doc<"calendar_connections">>,
): Doc<"calendar_connections"> | null {
  return (
    connections.find((connection) => connection.selectedCalendarId !== undefined) ??
    connections[0] ??
    null
  );
}

export const listCalendarConnections = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    return await ctx.db
      .query("calendar_connections")
      .withIndex("by_business_id_and_provider", (q) =>
        q.eq("businessId", args.businessId),
      )
      .collect();
  },
});

export const getBusinessCalendarConnectionState = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<CalendarConnectionState> => {
    const connections = await loadConnectedCalendarConnections(ctx, args.businessId);
    const selected = selectPreferredCalendarConnection(connections);
    return {
      hasConnectedCalendar: connections.length > 0,
      connectionCount: connections.length,
      ...(selected?._id !== undefined ? { selectedConnectionId: selected._id } : {}),
      ...(selected?.selectedCalendarId !== undefined
        ? { selectedCalendarId: selected.selectedCalendarId }
        : {}),
    };
  },
});

export const upsertCalendarConnection = mutation({
  args: {
    businessId: v.id("businesses"),
    provider: v.string(),
    externalAccountId: v.string(),
    selectedCalendarId: v.optional(v.string()),
    encryptedAccessToken: v.optional(v.string()),
    encryptedRefreshToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, args.businessId);
    const existing = await ctx.db
      .query("calendar_connections")
      .withIndex("by_provider_and_external_account_id", (q) =>
        q.eq("provider", args.provider).eq("externalAccountId", args.externalAccountId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.selectedCalendarId !== undefined
          ? { selectedCalendarId: args.selectedCalendarId }
          : {}),
        ...(args.encryptedAccessToken !== undefined
          ? { encryptedAccessToken: args.encryptedAccessToken }
          : {}),
        ...(args.encryptedRefreshToken !== undefined
          ? { encryptedRefreshToken: args.encryptedRefreshToken }
          : {}),
        status: "connected",
      });
      await ctx.runMutation(
        internal.ai.workflows.runtime.registerCalendarReconciliationCron,
        {
          businessId: args.businessId,
        },
      );
      return { connectionId: existing._id };
    }

    const connectionId = await ctx.db.insert("calendar_connections", {
      businessId: args.businessId,
      provider: args.provider,
      ownerUserId: membership.userId,
      externalAccountId: args.externalAccountId,
      ...(args.selectedCalendarId !== undefined
        ? { selectedCalendarId: args.selectedCalendarId }
        : {}),
      ...(args.encryptedAccessToken !== undefined
        ? { encryptedAccessToken: args.encryptedAccessToken }
        : {}),
      ...(args.encryptedRefreshToken !== undefined
        ? { encryptedRefreshToken: args.encryptedRefreshToken }
        : {}),
      status: "connected",
    });

    await ctx.runMutation(
      internal.ai.workflows.runtime.registerCalendarReconciliationCron,
      {
        businessId: args.businessId,
      },
    );
    await workflowManager.start(
      ctx,
      internal.ai.workflows.runtime.refreshBusinessContextSnapshotWorkflow,
      { businessId: args.businessId },
    );
    return { connectionId };
  },
});

export const getAppointmentCalendarSyncContext = internalQuery({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args): Promise<AppointmentSyncContext | null> => {
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      return null;
    }

    const [service, contact, connections] = await Promise.all([
      ctx.db.get(appointment.serviceId),
      ctx.db.get(appointment.contactId),
      loadConnectedCalendarConnections(ctx, appointment.businessId),
    ]);

    if (!service) {
      throw new Error("Service not found for appointment.");
    }
    if (!contact) {
      throw new Error("Contact not found for appointment.");
    }

    const selected = selectPreferredCalendarConnection(connections);

    return {
      appointment,
      serviceName: service.name,
      ...(contact.name !== undefined ? { contactName: contact.name } : {}),
      contactPhone: contact.phone,
      hasConnectedCalendar: connections.length > 0,
      ...(selected?._id !== undefined ? { selectedConnectionId: selected._id } : {}),
      ...(selected?.selectedCalendarId !== undefined
        ? { selectedCalendarId: selected.selectedCalendarId }
        : {}),
    };
  },
});

export const listAppointmentsForCalendarReconciliation = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const states: Array<CalendarSyncState> = [
      "pending",
      "syncing",
      "failed",
      "drifted",
      "not_required",
      "synced",
      "synced_mock",
    ];
    const appointmentsById = new Map<Id<"appointments">, Doc<"appointments">>();

    for (const state of states) {
      const appointments = await ctx.db
        .query("appointments")
        .withIndex("by_business_id_and_calendar_sync_state_and_starts_at", (q) =>
          q.eq("businessId", args.businessId).eq("calendarSyncState", state),
        )
        .collect();
      for (const appointment of appointments) {
        appointmentsById.set(appointment._id, appointment);
      }
    }

    return [...appointmentsById.values()].sort((left, right) =>
      left.startsAt.localeCompare(right.startsAt),
    );
  },
});

export const setAppointmentCalendarSyncState = internalMutation({
  args: {
    appointmentId: v.id("appointments"),
    calendarSyncState: calendarSyncStateValidator,
    calendarLastSyncAttemptAt: v.optional(v.string()),
    calendarLastSyncedAt: v.optional(v.string()),
    calendarLastSyncError: v.optional(v.string()),
    calendarReconcileAfter: v.optional(v.string()),
    calendarSyncIssueId: v.optional(v.id("inbox_items")),
    calendarExternalEventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Partial<Doc<"appointments">> = {
      calendarSyncState: args.calendarSyncState,
    };

    if (args.calendarLastSyncAttemptAt !== undefined) {
      patch.calendarLastSyncAttemptAt = args.calendarLastSyncAttemptAt;
    }
    if (args.calendarLastSyncedAt !== undefined) {
      patch.calendarLastSyncedAt = args.calendarLastSyncedAt;
    }
    if (args.calendarLastSyncError !== undefined) {
      patch.calendarLastSyncError = args.calendarLastSyncError;
    }
    if (args.calendarReconcileAfter !== undefined) {
      patch.calendarReconcileAfter = args.calendarReconcileAfter;
    }
    if (args.calendarSyncIssueId !== undefined) {
      patch.calendarSyncIssueId = args.calendarSyncIssueId;
    }
    if (args.calendarExternalEventId !== undefined) {
      patch.calendarExternalEventId = args.calendarExternalEventId;
    }

    await ctx.db.patch(args.appointmentId, patch);
    return null;
  },
});

export const recordCalendarAuditLog = internalMutation({
  args: {
    businessId: v.id("businesses"),
    eventType: v.string(),
    entityId: v.optional(v.string()),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("audit_logs", {
      businessId: args.businessId,
      eventType: args.eventType,
      entityType: "appointment",
      ...(args.entityId !== undefined ? { entityId: args.entityId } : {}),
      ...(args.payload !== undefined ? { payload: args.payload } : {}),
    });
    return null;
  },
});

export const upsertCalendarSyncIssue = internalMutation({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found.");
    }

    const [service, contact, existingOpenIssue] = await Promise.all([
      ctx.db.get(appointment.serviceId),
      ctx.db.get(appointment.contactId),
      ctx.db
        .query("inbox_items")
        .withIndex("by_kind_and_related_id", (q) =>
          q.eq("kind", "calendar_sync_issue").eq("relatedId", String(args.appointmentId)),
        )
        .collect(),
    ]);

    if (!service) {
      throw new Error("Service not found for appointment.");
    }
    if (!contact) {
      throw new Error("Contact not found for appointment.");
    }

    const title = `Calendar sync issue for ${service.name}`;
    const body = buildCalendarSyncIssueBody({
      appointment,
      serviceName: service.name,
      ...(contact.name !== undefined ? { contactName: contact.name } : {}),
      contactPhone: contact.phone,
    });

    const openIssue = existingOpenIssue.find((item) => item.status === "open") ?? null;
    if (openIssue) {
      await ctx.db.patch(openIssue._id, {
        title,
        body,
      });
      if (appointment.calendarSyncIssueId !== openIssue._id) {
        await ctx.db.patch(appointment._id, {
          calendarSyncIssueId: openIssue._id,
        });
      }
      return { issueId: openIssue._id, created: false };
    }

    const issueId = await ctx.db.insert("inbox_items", {
      businessId: appointment.businessId,
      kind: "calendar_sync_issue",
      title,
      body,
      relatedId: String(args.appointmentId),
      status: "open",
    });

    await ctx.db.patch(appointment._id, {
      calendarSyncIssueId: issueId,
    });
    await ctx.db.insert("audit_logs", {
      businessId: appointment.businessId,
      eventType: "calendar_sync_issue_opened",
      entityType: "appointment",
      entityId: String(appointment._id),
      payload: JSON.stringify({ issueId: String(issueId) }),
    });

    return { issueId, created: true };
  },
});

export const resolveCalendarSyncIssue = internalMutation({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found.");
    }

    const existingIssues = await ctx.db
      .query("inbox_items")
      .withIndex("by_kind_and_related_id", (q) =>
        q.eq("kind", "calendar_sync_issue").eq("relatedId", String(args.appointmentId)),
      )
      .collect();
    const openIssue = existingIssues.find((item) => item.status === "open") ?? null;
    if (!openIssue) {
      return { resolved: false };
    }

    await ctx.db.patch(openIssue._id, {
      status: "resolved",
    });
    await ctx.db.insert("audit_logs", {
      businessId: appointment.businessId,
      eventType: "calendar_sync_issue_resolved",
      entityType: "appointment",
      entityId: String(appointment._id),
      payload: JSON.stringify({ issueId: String(openIssue._id) }),
    });

    return { resolved: true, issueId: openIssue._id };
  },
});

export const syncAppointmentToExternalCalendars = internalAction({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.integrations.calendar.getAppointmentCalendarSyncContext,
      {
        appointmentId: args.appointmentId,
      },
    );
    if (!context) {
      throw new Error("Appointment not found.");
    }

    const nowIso = new Date().toISOString();
    const previousState = normalizeCalendarSyncState(
      context.appointment.calendarSyncState,
    );

    if (context.appointment.status !== "confirmed") {
      await ctx.runMutation(
        internal.integrations.calendar.setAppointmentCalendarSyncState,
        {
          appointmentId: args.appointmentId,
          calendarSyncState: "not_required",
        },
      );
      return { ok: true, status: "not_required" as const };
    }

    if (!context.hasConnectedCalendar) {
      await ctx.runMutation(
        internal.integrations.calendar.setAppointmentCalendarSyncState,
        {
          appointmentId: args.appointmentId,
          calendarSyncState: "not_required",
        },
      );
      await ctx.runMutation(
        internal.integrations.calendar.resolveCalendarSyncIssue,
        {
          appointmentId: args.appointmentId,
        },
      );
      return { ok: true, status: "not_required" as const };
    }

    await ctx.runMutation(
      internal.integrations.calendar.setAppointmentCalendarSyncState,
      {
        appointmentId: args.appointmentId,
        calendarSyncState: "syncing",
        calendarLastSyncAttemptAt: nowIso,
      },
    );

    try {
      if (!context.selectedConnectionId || !context.selectedCalendarId) {
        throw new Error("Connected calendar is missing a selected calendar.");
      }

      const externalEventId = buildMockExternalEventId(
        context.selectedConnectionId,
        context.appointment._id,
      );
      await ctx.runMutation(
        internal.integrations.calendar.setAppointmentCalendarSyncState,
        {
          appointmentId: args.appointmentId,
          calendarSyncState: "synced",
          calendarLastSyncAttemptAt: nowIso,
          calendarLastSyncedAt: nowIso,
          calendarExternalEventId: externalEventId,
        },
      );
      await ctx.runMutation(
        internal.integrations.calendar.resolveCalendarSyncIssue,
        {
          appointmentId: args.appointmentId,
        },
      );
      await ctx.runMutation(
        internal.integrations.calendar.recordCalendarAuditLog,
        {
          businessId: context.appointment.businessId,
          eventType:
            previousState === "failed" || previousState === "drifted"
              ? "appointment_calendar_sync_recovered"
              : "appointment_calendar_synced",
          entityId: String(context.appointment._id),
          payload: JSON.stringify({ externalEventId }),
        },
      );

      return {
        ok: true,
        status: "synced" as const,
        externalEventId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Calendar sync failed.";
      await ctx.runMutation(
        internal.integrations.calendar.setAppointmentCalendarSyncState,
        {
          appointmentId: args.appointmentId,
          calendarSyncState: "failed",
          calendarLastSyncAttemptAt: nowIso,
          calendarLastSyncError: message,
          calendarReconcileAfter: getRetryTime(nowIso),
        },
      );
      await ctx.runMutation(
        internal.integrations.calendar.recordCalendarAuditLog,
        {
          businessId: context.appointment.businessId,
          eventType: "appointment_calendar_sync_failed",
          entityId: String(context.appointment._id),
          payload: JSON.stringify({ error: message }),
        },
      );

      if (previousState === "failed" || previousState === "drifted") {
        await ctx.runMutation(
          internal.integrations.calendar.upsertCalendarSyncIssue,
          {
            appointmentId: args.appointmentId,
          },
        );
      }

      return {
        ok: false,
        status: "failed" as const,
        error: message,
      };
    }
  },
});

export const runBusinessCalendarReconciliation = internalAction({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<CalendarReconciliationResult> => {
    const nowIso = new Date().toISOString();
    const nowMs = Date.parse(nowIso);
    const [calendarState, appointments]: [
      CalendarConnectionState,
      Array<Doc<"appointments">>,
    ] = await Promise.all([
      ctx.runQuery(internal.integrations.calendar.getBusinessCalendarConnectionState, {
        businessId: args.businessId,
      }),
      ctx.runQuery(internal.integrations.calendar.listAppointmentsForCalendarReconciliation, {
        businessId: args.businessId,
      }),
    ]);

    let retried = 0;
    let failed = 0;
    let drifted = 0;
    let recovered = 0;
    let issuesOpened = 0;

    for (const appointment of appointments) {
      const state = normalizeCalendarSyncState(appointment.calendarSyncState);

      if (
        state === "not_required" &&
        appointment.status === "confirmed" &&
        calendarState.hasConnectedCalendar
      ) {
        await ctx.runMutation(
          internal.integrations.calendar.setAppointmentCalendarSyncState,
          {
            appointmentId: appointment._id,
            calendarSyncState: "drifted",
            calendarLastSyncError:
              "Connected calendar exists but the appointment was never queued for sync.",
            calendarReconcileAfter: getRetryTime(nowIso),
          },
        );
        const result = await ctx.runMutation(
          internal.integrations.calendar.upsertCalendarSyncIssue,
          {
            appointmentId: appointment._id,
          },
        );
        await ctx.runMutation(
          internal.integrations.calendar.recordCalendarAuditLog,
          {
            businessId: appointment.businessId,
            eventType: "appointment_calendar_drift_detected",
            entityId: String(appointment._id),
            payload: JSON.stringify({
              reason: "connected_calendar_with_not_required_state",
            }),
          },
        );
        drifted += 1;
        if (result.created) {
          issuesOpened += 1;
        }
        continue;
      }

      if (
        state === "synced" &&
        appointment.calendarSyncState !== "synced_mock" &&
        !appointment.calendarExternalEventId
      ) {
        await ctx.runMutation(
          internal.integrations.calendar.setAppointmentCalendarSyncState,
          {
            appointmentId: appointment._id,
            calendarSyncState: "drifted",
            calendarLastSyncError:
              "Appointment is marked synced but has no external calendar event ID.",
            calendarReconcileAfter: getRetryTime(nowIso),
          },
        );
        const result = await ctx.runMutation(
          internal.integrations.calendar.upsertCalendarSyncIssue,
          {
            appointmentId: appointment._id,
          },
        );
        await ctx.runMutation(
          internal.integrations.calendar.recordCalendarAuditLog,
          {
            businessId: appointment.businessId,
            eventType: "appointment_calendar_drift_detected",
            entityId: String(appointment._id),
            payload: JSON.stringify({ reason: "missing_external_event_id" }),
          },
        );
        drifted += 1;
        if (result.created) {
          issuesOpened += 1;
        }
        continue;
      }

      if (
        state === "pending" &&
        isStale(
          appointment.calendarLastSyncAttemptAt ?? new Date(appointment._creationTime).toISOString(),
          nowMs,
          CALENDAR_SYNC_PENDING_TIMEOUT_MS,
        )
      ) {
        const error = "Calendar sync remained pending past the timeout window.";
        await ctx.runMutation(
          internal.integrations.calendar.setAppointmentCalendarSyncState,
          {
            appointmentId: appointment._id,
            calendarSyncState: "failed",
            calendarLastSyncError: error,
            calendarReconcileAfter: getRetryTime(nowIso),
          },
        );
        await ctx.runMutation(
          internal.integrations.calendar.recordCalendarAuditLog,
          {
            businessId: appointment.businessId,
            eventType: "appointment_calendar_sync_failed",
            entityId: String(appointment._id),
            payload: JSON.stringify({ error }),
          },
        );
        failed += 1;
        continue;
      }

      if (
        state === "syncing" &&
        isStale(
          appointment.calendarLastSyncAttemptAt ?? new Date(appointment._creationTime).toISOString(),
          nowMs,
          CALENDAR_SYNC_SYNCING_TIMEOUT_MS,
        )
      ) {
        const error = "Calendar sync was stuck in progress past the timeout window.";
        await ctx.runMutation(
          internal.integrations.calendar.setAppointmentCalendarSyncState,
          {
            appointmentId: appointment._id,
            calendarSyncState: "failed",
            calendarLastSyncError: error,
            calendarReconcileAfter: getRetryTime(nowIso),
          },
        );
        await ctx.runMutation(
          internal.integrations.calendar.recordCalendarAuditLog,
          {
            businessId: appointment.businessId,
            eventType: "appointment_calendar_sync_failed",
            entityId: String(appointment._id),
            payload: JSON.stringify({ error }),
          },
        );
        failed += 1;
        continue;
      }

      if (state === "drifted") {
        const result = await ctx.runMutation(
          internal.integrations.calendar.upsertCalendarSyncIssue,
          {
            appointmentId: appointment._id,
          },
        );
        if (result.created) {
          issuesOpened += 1;
        }
        if (shouldRetrySync(appointment.calendarReconcileAfter, nowMs)) {
          retried += 1;
          const retryResult = await ctx.runAction(
            internal.integrations.calendar.syncAppointmentToExternalCalendars,
            {
              appointmentId: appointment._id,
            },
          );
          if (retryResult.ok) {
            recovered += 1;
          }
        }
        continue;
      }

      if (state === "failed" && shouldRetrySync(appointment.calendarReconcileAfter, nowMs)) {
        retried += 1;
        const result = await ctx.runAction(
          internal.integrations.calendar.syncAppointmentToExternalCalendars,
          {
            appointmentId: appointment._id,
          },
        );
        if (result.ok) {
          recovered += 1;
        }
      }
    }

    return {
      businessId: args.businessId,
      processed: appointments.length,
      retried,
      failed,
      drifted,
      recovered,
      issuesOpened,
    };
  },
});

export const getCalendarReconciliationSummary = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<CalendarReconciliationSummary> => {
    await requireMembership(ctx, args.businessId);
    const [appointments, openIssues]: [Array<Doc<"appointments">>, Array<Doc<"inbox_items">>] =
      await Promise.all([
      ctx.runQuery(internal.integrations.calendar.listAppointmentsForCalendarReconciliation, {
        businessId: args.businessId,
      }),
      ctx.db
        .query("inbox_items")
        .withIndex("by_business_id_and_kind_and_status", (q) =>
          q.eq("businessId", args.businessId)
            .eq("kind", "calendar_sync_issue")
            .eq("status", "open"),
        )
        .collect(),
      ]);

    const counts: Record<NormalizedCalendarSyncState, number> = {
      not_required: 0,
      pending: 0,
      syncing: 0,
      synced: 0,
      failed: 0,
      drifted: 0,
    };

    for (const appointment of appointments) {
      counts[normalizeCalendarSyncState(appointment.calendarSyncState)] += 1;
    }

    return {
      businessId: args.businessId,
      counts,
      openIssueCount: openIssues.length,
    };
  },
});

export const listCalendarReconciliationIssues = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const issues = await ctx.db
      .query("inbox_items")
      .withIndex("by_business_id_and_kind_and_status", (q) =>
        q.eq("businessId", args.businessId)
          .eq("kind", "calendar_sync_issue")
          .eq("status", "open"),
      )
      .collect();

    const hydrated = await Promise.all(
      issues.map(async (issue) => {
        const appointmentId = issue.relatedId as Id<"appointments"> | undefined;
        const appointment = appointmentId
          ? await ctx.db.get(appointmentId)
          : null;
        const [service, contact] = appointment
          ? await Promise.all([
              ctx.db.get(appointment.serviceId),
              ctx.db.get(appointment.contactId),
            ])
          : [null, null];

        return {
          issueId: issue._id,
          title: issue.title,
          body: issue.body,
          status: issue.status,
          appointmentId: appointment?._id,
          startsAt: appointment?.startsAt,
          serviceName: service?.name,
          contactName: contact?.name,
          contactPhone: contact?.phone,
          syncState: appointment
            ? normalizeCalendarSyncState(appointment.calendarSyncState)
            : null,
          lastSyncError:
            appointment &&
            normalizeCalendarSyncState(appointment.calendarSyncState) !== "synced"
              ? appointment.calendarLastSyncError ?? null
              : null,
        };
      }),
    );

    return hydrated;
  },
});

export const listAppointmentsNeedingCalendarAttention = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const unhealthyStates: Array<NormalizedCalendarSyncState> = [
      "pending",
      "syncing",
      "failed",
      "drifted",
    ];
    const appointmentsById = new Map<Id<"appointments">, Doc<"appointments">>();

    for (const state of unhealthyStates) {
      const appointments = await ctx.db
        .query("appointments")
        .withIndex("by_business_id_and_calendar_sync_state_and_starts_at", (q) =>
          q.eq("businessId", args.businessId).eq("calendarSyncState", state),
        )
        .collect();
      for (const appointment of appointments) {
        appointmentsById.set(appointment._id, appointment);
      }
    }

    const hydrated = await Promise.all(
      [...appointmentsById.values()].map(async (appointment) => {
        const [service, contact] = await Promise.all([
          ctx.db.get(appointment.serviceId),
          ctx.db.get(appointment.contactId),
        ]);

        return {
          appointmentId: appointment._id,
          startsAt: appointment.startsAt,
          status: appointment.status,
          syncState: normalizeCalendarSyncState(appointment.calendarSyncState),
          lastSyncAttemptAt: appointment.calendarLastSyncAttemptAt ?? null,
          lastSyncedAt: appointment.calendarLastSyncedAt ?? null,
          lastSyncError: appointment.calendarLastSyncError ?? null,
          reconcileAfter: appointment.calendarReconcileAfter ?? null,
          serviceName: service?.name ?? null,
          contactName: contact?.name ?? null,
          contactPhone: contact?.phone ?? null,
        };
      }),
    );

    return hydrated.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  },
});

export const connectGoogle = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (_ctx, args) => {
    return {
      businessId: args.businessId,
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    };
  },
});

export const connectMicrosoft = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (_ctx, args) => {
    return {
      businessId: args.businessId,
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    };
  },
});
