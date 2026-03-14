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
import { requireIdentity, requireMembership } from "../lib/auth";
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
  provider?: string;
  staffId: Id<"staff">;
  selectedConnectionId?: Id<"calendar_connections">;
  selectedCalendarId?: string;
};

type CalendarConnectionState = {
  hasConnectedCalendar: boolean;
  selectedConnectionId?: Id<"calendar_connections">;
  selectedCalendarId?: string;
};

type CalendarAccessContext = {
  businessId: Id<"businesses">;
  userId: Id<"users">;
  staffId: Id<"staff">;
  staffName: string;
  existingConnectionId?: Id<"calendar_connections">;
};

type CalendarBusyBlockInput = {
  startsAt: string;
  endsAt: string;
  externalEventId: string;
  sourceCalendarId: string;
  externalUpdatedAt?: string;
};

type GoogleCalendarOption = {
  id: string;
  summary: string;
  primary: boolean;
  selected: boolean;
};

type GoogleConnectResult = {
  authorizationUrl: string;
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
  input?: {
    provider?: string;
    staffId?: Id<"staff">;
  },
): Promise<Array<Doc<"calendar_connections">>> {
  const connections = await ctx.db
    .query("calendar_connections")
    .withIndex("by_business_id_and_status", (q) =>
      q.eq("businessId", businessId).eq("status", "connected"),
    )
    .collect();
  return connections.filter((connection) => {
    if (input?.provider && connection.provider !== input.provider) {
      return false;
    }
    if (input?.staffId && connection.staffId !== input.staffId) {
      return false;
    }
    return true;
  });
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

function isGoogleConnectionReady(
  connection: Doc<"calendar_connections"> | null,
): connection is Doc<"calendar_connections"> {
  return (
    connection !== null &&
    connection.provider === "google" &&
    connection.staffId !== undefined &&
    connection.selectedCalendarId !== undefined
  );
}

async function getUserIdByAuthSubject(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  authSubject: string,
): Promise<Id<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", authSubject))
    .unique();
  return user?._id ?? null;
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
    const connections = await loadConnectedCalendarConnections(ctx, args.businessId, {
      provider: "google",
    });
    const selected = selectPreferredCalendarConnection(connections);
    return {
      hasConnectedCalendar: connections.length > 0,
      ...(selected?._id !== undefined ? { selectedConnectionId: selected._id } : {}),
      ...(selected?.selectedCalendarId !== undefined
        ? { selectedCalendarId: selected.selectedCalendarId }
        : {}),
    };
  },
});

export const getStaffCalendarConnectionState = internalQuery({
  args: {
    businessId: v.id("businesses"),
    staffId: v.id("staff"),
  },
  handler: async (ctx, args): Promise<CalendarConnectionState> => {
    const connections = await loadConnectedCalendarConnections(ctx, args.businessId, {
      provider: "google",
      staffId: args.staffId,
    });
    const selected = selectPreferredCalendarConnection(connections);
    return {
      hasConnectedCalendar: selected !== null,
      ...(selected?._id !== undefined ? { selectedConnectionId: selected._id } : {}),
      ...(selected?.selectedCalendarId !== undefined
        ? { selectedCalendarId: selected.selectedCalendarId }
        : {}),
    };
  },
});

export const listConnectedCalendarConnectionsForBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    return await loadConnectedCalendarConnections(ctx, args.businessId, {
      provider: "google",
    });
  },
});

export const getCalendarConnectionAccessContext = internalQuery({
  args: {
    businessId: v.id("businesses"),
    staffId: v.id("staff"),
    authSubject: v.string(),
  },
  handler: async (ctx, args): Promise<CalendarAccessContext> => {
    const userId = await getUserIdByAuthSubject(ctx, args.authSubject);
    if (!userId) {
      throw new Error("Authenticated user profile not found.");
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_user_id_and_business_id", (q) =>
        q.eq("userId", userId).eq("businessId", args.businessId),
      )
      .unique();
    if (!membership || membership.status !== "active") {
      throw new Error("You do not have access to this business.");
    }

    const staff = await ctx.db.get(args.staffId);
    if (!staff || staff.businessId !== args.businessId) {
      throw new Error("Staff member not found for this business.");
    }

    const existingConnection = await ctx.db
      .query("calendar_connections")
      .withIndex("by_business_id_and_provider_and_staff_id", (q) =>
        q.eq("businessId", args.businessId).eq("provider", "google").eq("staffId", args.staffId),
      )
      .unique();

    return {
      businessId: args.businessId,
      userId,
      staffId: args.staffId,
      staffName: staff.name,
      ...(existingConnection?._id !== undefined
        ? { existingConnectionId: existingConnection._id }
        : {}),
    };
  },
});

export const getCalendarConnectionById = internalQuery({
  args: {
    connectionId: v.id("calendar_connections"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.connectionId);
  },
});

export const getCalendarConnectionRuntimeContext = internalQuery({
  args: {
    connectionId: v.id("calendar_connections"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) {
      return null;
    }

    const staff =
      connection.staffId !== undefined ? await ctx.db.get(connection.staffId) : null;

    return {
      connection,
      staffTimezone: staff?.timezone ?? null,
      staffName: staff?.name ?? null,
    };
  },
});

export const createCalendarOAuthState = internalMutation({
  args: {
    provider: v.string(),
    businessId: v.id("businesses"),
    userId: v.id("users"),
    staffId: v.id("staff"),
    nonce: v.string(),
    expiresAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("calendar_oauth_states")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return await ctx.db.insert("calendar_oauth_states", args);
  },
});

export const consumeCalendarOAuthState = internalMutation({
  args: {
    nonce: v.string(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("calendar_oauth_states")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .unique();
    if (!state) {
      return null;
    }

    await ctx.db.delete(state._id);

    if (Date.parse(state.expiresAt) < Date.now()) {
      throw new Error("Google Calendar connection request expired.");
    }

    return state;
  },
});

export const upsertGoogleCalendarConnection = internalMutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    staffId: v.id("staff"),
    externalAccountId: v.string(),
    externalAccountEmail: v.optional(v.string()),
    selectedCalendarId: v.string(),
    selectedCalendarSummary: v.string(),
    encryptedAccessToken: v.string(),
    encryptedRefreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.string()),
    syncCursor: v.optional(v.string()),
    syncWindowStartsAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("calendar_connections")
      .withIndex("by_business_id_and_provider_and_staff_id", (q) =>
        q.eq("businessId", args.businessId).eq("provider", "google").eq("staffId", args.staffId),
      )
      .unique();

    if (existing) {
      const {
        externalAccountEmail: _existingExternalAccountEmail,
        encryptedRefreshToken: _existingEncryptedRefreshToken,
        tokenExpiresAt: _existingTokenExpiresAt,
        syncCursor: _existingSyncCursor,
        syncWindowStartsAt: _existingSyncWindowStartsAt,
        lastSyncAttemptAt: existingLastSyncAttemptAt,
        lastSyncedAt: existingLastSyncedAt,
        lastSyncError: _lastSyncError,
        ...rest
      } = existing;
      await ctx.db.replace(existing._id, {
        ...rest,
        ownerUserId: args.userId,
        externalAccountId: args.externalAccountId,
        ...(args.externalAccountEmail !== undefined
          ? { externalAccountEmail: args.externalAccountEmail }
          : {}),
        staffId: args.staffId,
        selectedCalendarId: args.selectedCalendarId,
        selectedCalendarSummary: args.selectedCalendarSummary,
        status: "connected",
        encryptedAccessToken: args.encryptedAccessToken,
        ...(args.encryptedRefreshToken !== undefined
          ? { encryptedRefreshToken: args.encryptedRefreshToken }
          : {}),
        ...(args.tokenExpiresAt !== undefined ? { tokenExpiresAt: args.tokenExpiresAt } : {}),
        ...(args.syncCursor !== undefined ? { syncCursor: args.syncCursor } : {}),
        ...(args.syncWindowStartsAt !== undefined
          ? { syncWindowStartsAt: args.syncWindowStartsAt }
          : {}),
        ...(existingLastSyncAttemptAt !== undefined
          ? { lastSyncAttemptAt: existingLastSyncAttemptAt }
          : {}),
        ...(existingLastSyncedAt !== undefined ? { lastSyncedAt: existingLastSyncedAt } : {}),
      });
      return existing._id;
    }

    return await ctx.db.insert("calendar_connections", {
      businessId: args.businessId,
      provider: "google",
      ownerUserId: args.userId,
      staffId: args.staffId,
      externalAccountId: args.externalAccountId,
      ...(args.externalAccountEmail !== undefined
        ? { externalAccountEmail: args.externalAccountEmail }
        : {}),
      selectedCalendarId: args.selectedCalendarId,
      selectedCalendarSummary: args.selectedCalendarSummary,
      status: "connected",
      encryptedAccessToken: args.encryptedAccessToken,
      ...(args.encryptedRefreshToken !== undefined
        ? { encryptedRefreshToken: args.encryptedRefreshToken }
        : {}),
      ...(args.tokenExpiresAt !== undefined ? { tokenExpiresAt: args.tokenExpiresAt } : {}),
      ...(args.syncCursor !== undefined ? { syncCursor: args.syncCursor } : {}),
      ...(args.syncWindowStartsAt !== undefined
        ? { syncWindowStartsAt: args.syncWindowStartsAt }
        : {}),
    });
  },
});

export const updateCalendarConnectionSelection = internalMutation({
  args: {
    connectionId: v.id("calendar_connections"),
    selectedCalendarId: v.string(),
    selectedCalendarSummary: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) {
      throw new Error("Calendar connection not found.");
    }
    const {
      syncCursor: _syncCursor,
      syncWindowStartsAt: _syncWindowStartsAt,
      lastSyncError: _lastSyncError,
      ...rest
    } = connection;

    await ctx.db.replace(args.connectionId, {
      ...rest,
      selectedCalendarId: args.selectedCalendarId,
      selectedCalendarSummary: args.selectedCalendarSummary,
    });
    return null;
  },
});

export const recordCalendarConnectionSyncAttempt = internalMutation({
  args: {
    connectionId: v.id("calendar_connections"),
    attemptedAt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      lastSyncAttemptAt: args.attemptedAt,
    });
    return null;
  },
});

export const updateCalendarConnectionCredentials = internalMutation({
  args: {
    connectionId: v.id("calendar_connections"),
    encryptedAccessToken: v.string(),
    encryptedRefreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      encryptedAccessToken: args.encryptedAccessToken,
      ...(args.encryptedRefreshToken !== undefined
        ? { encryptedRefreshToken: args.encryptedRefreshToken }
        : {}),
      ...(args.tokenExpiresAt !== undefined ? { tokenExpiresAt: args.tokenExpiresAt } : {}),
    });
    return null;
  },
});

export const recordCalendarConnectionSyncSuccess = internalMutation({
  args: {
    connectionId: v.id("calendar_connections"),
    syncedAt: v.string(),
    syncCursor: v.optional(v.string()),
    syncWindowStartsAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) {
      throw new Error("Calendar connection not found.");
    }
    const { lastSyncError: _lastSyncError, ...rest } = connection;

    await ctx.db.replace(args.connectionId, {
      ...rest,
      lastSyncedAt: args.syncedAt,
      ...(args.syncCursor !== undefined ? { syncCursor: args.syncCursor } : {}),
      ...(args.syncWindowStartsAt !== undefined
        ? { syncWindowStartsAt: args.syncWindowStartsAt }
        : {}),
    });
    return null;
  },
});

export const recordCalendarConnectionSyncFailure = internalMutation({
  args: {
    connectionId: v.id("calendar_connections"),
    attemptedAt: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      lastSyncAttemptAt: args.attemptedAt,
      lastSyncError: args.message,
    });
    return null;
  },
});

export const applyCalendarBusyBlockChanges = internalMutation({
  args: {
    connectionId: v.id("calendar_connections"),
    fullSync: v.boolean(),
    syncCursor: v.optional(v.string()),
    syncWindowStartsAt: v.optional(v.string()),
    syncedAt: v.string(),
    busyBlocks: v.array(
      v.object({
        startsAt: v.string(),
        endsAt: v.string(),
        externalEventId: v.string(),
        sourceCalendarId: v.string(),
        externalUpdatedAt: v.optional(v.string()),
      }),
    ),
    removedExternalEventIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) {
      throw new Error("Calendar connection not found.");
    }

    if (args.fullSync) {
      const existing = await ctx.db
        .query("calendar_busy_blocks")
        .withIndex("by_connection_id_and_starts_at", (q) => q.eq("connectionId", args.connectionId))
        .collect();
      for (const block of existing) {
        await ctx.db.delete(block._id);
      }
    } else {
      for (const externalEventId of args.removedExternalEventIds) {
        const existing = await ctx.db
          .query("calendar_busy_blocks")
          .withIndex("by_connection_id_and_external_event_id", (q) =>
            q.eq("connectionId", args.connectionId).eq("externalEventId", externalEventId),
          )
          .collect();
        for (const block of existing) {
          await ctx.db.delete(block._id);
        }
      }
    }

    for (const block of args.busyBlocks) {
      const existing = await ctx.db
        .query("calendar_busy_blocks")
        .withIndex("by_connection_id_and_external_event_id", (q) =>
          q.eq("connectionId", args.connectionId).eq("externalEventId", block.externalEventId),
        )
        .unique();

      const payload = {
        businessId: connection.businessId,
        ...(connection.staffId !== undefined ? { staffId: connection.staffId } : {}),
        connectionId: args.connectionId,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        externalEventId: block.externalEventId,
        sourceCalendarId: block.sourceCalendarId,
        ...(block.externalUpdatedAt !== undefined
          ? { externalUpdatedAt: block.externalUpdatedAt }
          : {}),
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("calendar_busy_blocks", payload);
      }
    }

    const refreshedConnection = await ctx.db.get(args.connectionId);
    if (!refreshedConnection) {
      throw new Error("Calendar connection not found.");
    }
    const { lastSyncError: _lastSyncError, ...rest } = refreshedConnection;

    await ctx.db.replace(args.connectionId, {
      ...rest,
      lastSyncedAt: args.syncedAt,
      ...(args.syncCursor !== undefined ? { syncCursor: args.syncCursor } : {}),
      ...(args.syncWindowStartsAt !== undefined
        ? { syncWindowStartsAt: args.syncWindowStartsAt }
        : {}),
    });

    return null;
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
      loadConnectedCalendarConnections(ctx, appointment.businessId, {
        provider: "google",
        staffId: appointment.staffId,
      }),
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
      staffId: appointment.staffId,
      ...(selected?.provider !== undefined ? { provider: selected.provider } : {}),
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
    clearCalendarLastSyncError: v.optional(v.boolean()),
    clearCalendarReconcileAfter: v.optional(v.boolean()),
    clearCalendarSyncIssueId: v.optional(v.boolean()),
    clearCalendarExternalEventId: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const appointment = await ctx.db.get(args.appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found.");
    }

    const next: Doc<"appointments"> = {
      ...appointment,
      calendarSyncState: args.calendarSyncState,
    };

    if (args.calendarLastSyncAttemptAt !== undefined) {
      next.calendarLastSyncAttemptAt = args.calendarLastSyncAttemptAt;
    }
    if (args.calendarLastSyncedAt !== undefined) {
      next.calendarLastSyncedAt = args.calendarLastSyncedAt;
    }
    if (args.calendarLastSyncError !== undefined) {
      next.calendarLastSyncError = args.calendarLastSyncError;
    }
    if (args.calendarReconcileAfter !== undefined) {
      next.calendarReconcileAfter = args.calendarReconcileAfter;
    }
    if (args.calendarSyncIssueId !== undefined) {
      next.calendarSyncIssueId = args.calendarSyncIssueId;
    }
    if (args.calendarExternalEventId !== undefined) {
      next.calendarExternalEventId = args.calendarExternalEventId;
    }
    if (args.clearCalendarLastSyncError) {
      delete next.calendarLastSyncError;
    }
    if (args.clearCalendarReconcileAfter) {
      delete next.calendarReconcileAfter;
    }
    if (args.clearCalendarSyncIssueId) {
      delete next.calendarSyncIssueId;
    }
    if (args.clearCalendarExternalEventId) {
      delete next.calendarExternalEventId;
    }

    await ctx.db.replace(args.appointmentId, next);
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
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; status: "not_required" }
    | { ok: true; status: "synced"; externalEventId: string }
    | { ok: false; status: "failed"; error: string }
  > => {
    const context: AppointmentSyncContext | null = await ctx.runQuery(
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

    if (
      context.appointment.status !== "confirmed" &&
      !context.appointment.calendarExternalEventId
    ) {
      await ctx.runMutation(
        internal.integrations.calendar.setAppointmentCalendarSyncState,
        {
          appointmentId: args.appointmentId,
          calendarSyncState: "not_required",
          clearCalendarLastSyncError: true,
          clearCalendarReconcileAfter: true,
        },
      );
      return { ok: true, status: "not_required" as const };
    }

    if (
      context.provider !== "google" ||
      !context.selectedConnectionId ||
      !context.selectedCalendarId
    ) {
      await ctx.runMutation(
        internal.integrations.calendar.setAppointmentCalendarSyncState,
        {
          appointmentId: args.appointmentId,
          calendarSyncState: "not_required",
          clearCalendarLastSyncError: true,
          clearCalendarReconcileAfter: true,
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
      const result: { ok: true; status: "not_required" | "deleted" }
        | { ok: true; status: "synced"; externalEventId: string } = await ctx.runAction(
        internal.integrations.googleCalendar.syncAppointmentEvent,
        {
          appointmentId: args.appointmentId,
        },
      );

      await ctx.runMutation(
        internal.integrations.calendar.setAppointmentCalendarSyncState,
        {
          appointmentId: args.appointmentId,
          calendarSyncState:
            context.appointment.status === "confirmed" ? "synced" : "not_required",
          calendarLastSyncAttemptAt: nowIso,
          calendarLastSyncedAt: nowIso,
          ...(result.status === "synced" && "externalEventId" in result
            ? { calendarExternalEventId: result.externalEventId }
            : {}),
          ...(context.appointment.status !== "confirmed"
            ? { clearCalendarExternalEventId: true }
            : {}),
          clearCalendarLastSyncError: true,
          clearCalendarReconcileAfter: true,
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
          payload: JSON.stringify(
            result.status === "synced" && "externalEventId" in result
              ? { externalEventId: result.externalEventId }
              : { action: result.status },
          ),
        },
      );

      if (context.appointment.status === "confirmed") {
        return {
          ok: true,
          status: "synced" as const,
          externalEventId:
            result.status === "synced" && "externalEventId" in result
              ? result.externalEventId
              : context.appointment.calendarExternalEventId ?? "",
        };
      }

      return {
        ok: true,
        status: "not_required" as const,
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
    const [appointments, connections]: [
      Array<Doc<"appointments">>,
      Array<Doc<"calendar_connections">>,
    ] = await Promise.all([
      ctx.runQuery(internal.integrations.calendar.listAppointmentsForCalendarReconciliation, {
        businessId: args.businessId,
      }),
      ctx.runQuery(internal.integrations.calendar.listConnectedCalendarConnectionsForBusiness, {
        businessId: args.businessId,
      }),
    ]);

    for (const connection of connections) {
      if (!isGoogleConnectionReady(connection)) {
        continue;
      }

      try {
        await ctx.runAction(internal.integrations.googleCalendar.syncBusyTimeForConnection, {
          connectionId: connection._id,
        });
      } catch {
        // Connection-level sync errors are recorded on the connection itself.
      }
    }
    const readyConnectionStaffIds = new Set(
      connections
        .filter((connection) => isGoogleConnectionReady(connection) && connection.staffId !== undefined)
        .map((connection) => String(connection.staffId)),
    );

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
        readyConnectionStaffIds.has(String(appointment.staffId))
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
    staffId: v.id("staff"),
  },
  handler: async (ctx, args): Promise<GoogleConnectResult> => {
    const identity = await requireIdentity(ctx);
    return (await ctx.runAction(
      internal.integrations.googleCalendar.startGoogleConnection,
      {
        ...args,
        authSubject: identity.subject,
      },
    )) as GoogleConnectResult;
  },
});

export const listGoogleCalendars = action({
  args: {
    businessId: v.id("businesses"),
    staffId: v.id("staff"),
  },
  handler: async (ctx, args): Promise<Array<GoogleCalendarOption>> => {
    const identity = await requireIdentity(ctx);
    const accessContext: CalendarAccessContext = await ctx.runQuery(
      internal.integrations.calendar.getCalendarConnectionAccessContext,
      {
        businessId: args.businessId,
        staffId: args.staffId,
        authSubject: identity.subject,
      },
    );

    if (!accessContext.existingConnectionId) {
      return [];
    }

    return (await ctx.runAction(
      internal.integrations.googleCalendar.listAvailableCalendars,
      {
        connectionId: accessContext.existingConnectionId,
      },
    )) as Array<GoogleCalendarOption>;
  },
});

export const selectGoogleCalendar = action({
  args: {
    businessId: v.id("businesses"),
    staffId: v.id("staff"),
    calendarId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ selectedCalendarId: string; selectedCalendarSummary: string }> => {
    const identity = await requireIdentity(ctx);
    const accessContext: CalendarAccessContext = await ctx.runQuery(
      internal.integrations.calendar.getCalendarConnectionAccessContext,
      {
        businessId: args.businessId,
        staffId: args.staffId,
        authSubject: identity.subject,
      },
    );

    if (!accessContext.existingConnectionId) {
      throw new Error("Connect Google Calendar before choosing a calendar.");
    }

    const calendars: Array<GoogleCalendarOption> = await ctx.runAction(
      internal.integrations.googleCalendar.listAvailableCalendars,
      {
        connectionId: accessContext.existingConnectionId,
      },
    );
    const selected = calendars.find(
      (calendar: GoogleCalendarOption) => calendar.id === args.calendarId,
    );
    if (!selected) {
      throw new Error("Selected Google calendar was not found.");
    }

    await ctx.runMutation(
      internal.integrations.calendar.updateCalendarConnectionSelection,
      {
        connectionId: accessContext.existingConnectionId,
        selectedCalendarId: selected.id,
        selectedCalendarSummary: selected.summary,
      },
    );
    await ctx.runAction(
      internal.integrations.googleCalendar.syncBusyTimeForConnection,
      {
        connectionId: accessContext.existingConnectionId,
        fullSync: true,
      },
    );

    return {
      selectedCalendarId: selected.id,
      selectedCalendarSummary: selected.summary,
    };
  },
});

export const connectMicrosoft = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{ businessId: Id<"businesses">; authorizationUrl: string }> => {
    return {
      businessId: args.businessId,
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    };
  },
});
