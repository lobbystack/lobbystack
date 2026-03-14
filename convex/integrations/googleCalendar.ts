"use node";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";

const GOOGLE_AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3";
const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const GOOGLE_SYNC_WINDOW_DAYS = 180;
const GOOGLE_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar",
];

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type GoogleUserInfo = {
  sub: string;
  email?: string;
};

type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  accessRole?: string;
  primary?: boolean;
};

type GoogleCalendarListResponse = {
  items?: Array<GoogleCalendarListEntry>;
};

type GoogleEventDateTime = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

type GoogleCalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  transparency?: string;
  updated?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
};

type GoogleEventsResponse = {
  items?: Array<GoogleCalendarEvent>;
  nextPageToken?: string;
  nextSyncToken?: string;
};

type BusyBlockChange = {
  startsAt: string;
  endsAt: string;
  externalEventId: string;
  sourceCalendarId: string;
  externalUpdatedAt?: string;
};

type GoogleCalendarAccessContext = {
  businessId: Id<"businesses">;
  userId: Id<"users">;
  staffId: Id<"staff">;
  staffName: string;
  existingConnectionId?: Id<"calendar_connections">;
};

type AppointmentSyncContext = {
  appointment: Doc<"appointments">;
  serviceName: string;
  contactName?: string;
  contactPhone: string;
  provider?: string;
  staffId: Id<"staff">;
  selectedConnectionId?: Id<"calendar_connections">;
  selectedCalendarId?: string;
} | null;

function requireGoogleEnv(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  appBaseUrl: string;
} {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const appBaseUrl = process.env.APP_BASE_URL;

  if (!clientId || !clientSecret || !redirectUri || !appBaseUrl) {
    throw new Error(
      "Google Calendar OAuth requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and APP_BASE_URL.",
    );
  }

  return { clientId, clientSecret, redirectUri, appBaseUrl };
}

function deriveEncryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function encryptSecret(secret: string): string {
  const sessionKey = process.env.SESSION_ENCRYPTION_KEY;
  if (!sessionKey) {
    throw new Error("SESSION_ENCRYPTION_KEY is required for Google Calendar token storage.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveEncryptionKey(sessionKey), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptSecret(secret: string): string {
  const sessionKey = process.env.SESSION_ENCRYPTION_KEY;
  if (!sessionKey) {
    throw new Error("SESSION_ENCRYPTION_KEY is required for Google Calendar token storage.");
  }

  const [ivPart, tagPart, payloadPart] = secret.split(".");
  if (!ivPart || !tagPart || !payloadPart) {
    throw new Error("Stored Google Calendar secret is malformed.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(sessionKey),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadPart, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function buildGoogleAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = requireGoogleEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
  });
  return `${GOOGLE_AUTH_BASE_URL}?${params.toString()}`;
}

function buildSettingsRedirectUrl(input: {
  status: "success" | "error";
  staffId?: Id<"staff">;
  message?: string;
}): string {
  const { appBaseUrl } = requireGoogleEnv();
  const url = new URL("/settings/integrations", appBaseUrl);
  url.searchParams.set("calendar", "google");
  url.searchParams.set("status", input.status);
  if (input.staffId) {
    url.searchParams.set("staffId", String(input.staffId));
  }
  if (input.message) {
    url.searchParams.set("message", input.message);
  }
  return url.toString();
}

function getTokenExpiryIso(expiresIn?: number): string | undefined {
  if (expiresIn === undefined) {
    return undefined;
  }

  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function isTokenFresh(tokenExpiresAt: string | undefined): boolean {
  if (!tokenExpiresAt) {
    return false;
  }
  return Date.parse(tokenExpiresAt) - GOOGLE_TOKEN_REFRESH_BUFFER_MS > Date.now();
}

function pickDefaultCalendar(
  calendars: Array<GoogleCalendarListEntry>,
): GoogleCalendarListEntry | null {
  return (
    calendars.find((calendar) => calendar.primary && isWritableCalendar(calendar.accessRole)) ??
    calendars.find((calendar) => isWritableCalendar(calendar.accessRole)) ??
    null
  );
}

function isWritableCalendar(accessRole?: string): boolean {
  return accessRole === "owner" || accessRole === "writer";
}

function toIsoFromGoogleDateTime(
  input: GoogleEventDateTime | undefined,
  fallbackTimezone: string,
): string | null {
  if (!input) {
    return null;
  }

  if (input.dateTime) {
    const value = DateTime.fromISO(input.dateTime, {
      setZone: true,
      zone: input.timeZone ?? fallbackTimezone,
    });
    return value.isValid ? (value.toUTC().toISO() ?? null) : null;
  }

  if (input.date) {
    const value = DateTime.fromISO(input.date, { zone: fallbackTimezone }).startOf("day");
    return value.isValid ? (value.toUTC().toISO() ?? null) : null;
  }

  return null;
}

function toBusyBlock(
  event: GoogleCalendarEvent,
  sourceCalendarId: string,
  fallbackTimezone: string,
): BusyBlockChange | null {
  if (!event.id || event.status === "cancelled" || event.transparency === "transparent") {
    return null;
  }

  const startsAt = toIsoFromGoogleDateTime(event.start, fallbackTimezone);
  const endsAt = toIsoFromGoogleDateTime(event.end, fallbackTimezone);
  if (!startsAt || !endsAt) {
    return null;
  }

  return {
    startsAt,
    endsAt,
    externalEventId: event.id,
    sourceCalendarId,
    ...(event.updated !== undefined ? { externalUpdatedAt: event.updated } : {}),
  };
}

async function parseGoogleError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: string | { message?: string };
      error_description?: string;
      error_description_en?: string;
    };

    if (typeof body.error === "string" && body.error_description) {
      return `${body.error}: ${body.error_description}`;
    }
    if (typeof body.error === "string") {
      return body.error;
    }
    if (typeof body.error === "object" && body.error?.message) {
      return body.error.message;
    }
  } catch {
    // Ignore parse failures and fall back below.
  }

  return `${response.status} ${response.statusText}`;
}

async function exchangeAuthorizationCode(code: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = requireGoogleEnv();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${await parseGoogleError(response)}`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

async function refreshGoogleAccessToken(input: {
  connectionId: Id<"calendar_connections">;
  encryptedRefreshToken?: string;
}): Promise<{
  accessToken: string;
  tokenExpiresAt?: string;
}> {
  const { clientId, clientSecret } = requireGoogleEnv();
  if (!input.encryptedRefreshToken) {
    throw new Error("Google Calendar connection is missing a refresh token.");
  }

  const refreshToken = decryptSecret(input.encryptedRefreshToken);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${await parseGoogleError(response)}`);
  }

  const payload = (await response.json()) as GoogleTokenResponse;
  if (!payload.access_token) {
    throw new Error("Google token refresh response did not include an access token.");
  }

  const tokenExpiresAt = getTokenExpiryIso(payload.expires_in);
  return {
    accessToken: payload.access_token,
    ...(tokenExpiresAt !== undefined ? { tokenExpiresAt } : {}),
  };
}

async function withGoogleAccessToken(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  connectionId: Id<"calendar_connections">,
): Promise<{
  accessToken: string;
  connection: Doc<"calendar_connections">;
  staffTimezone: string;
}> {
  const runtimeContext = await ctx.runQuery(
    internal.integrations.calendar.getCalendarConnectionRuntimeContext,
    {
      connectionId,
    },
  );
  if (!runtimeContext) {
    throw new Error("Calendar connection not found.");
  }

  const { connection, staffTimezone } = runtimeContext;
  const timezone = staffTimezone ?? "UTC";

  if (connection.provider !== "google") {
    throw new Error("Only Google Calendar connections are supported in this provider action.");
  }
  if (!connection.encryptedAccessToken) {
    throw new Error("Google Calendar connection is missing an access token.");
  }

  if (isTokenFresh(connection.tokenExpiresAt)) {
    return {
      accessToken: decryptSecret(connection.encryptedAccessToken),
      connection,
      staffTimezone: timezone,
    };
  }

  const refreshed = await refreshGoogleAccessToken({
    connectionId,
    encryptedRefreshToken: connection.encryptedRefreshToken,
  });
  await ctx.runMutation(internal.integrations.calendar.updateCalendarConnectionCredentials, {
    connectionId,
    encryptedAccessToken: encryptSecret(refreshed.accessToken),
    ...(connection.encryptedRefreshToken !== undefined
      ? { encryptedRefreshToken: connection.encryptedRefreshToken }
      : {}),
    ...(refreshed.tokenExpiresAt !== undefined
      ? { tokenExpiresAt: refreshed.tokenExpiresAt }
      : {}),
  });

  return {
    accessToken: refreshed.accessToken,
    connection: {
      ...connection,
      encryptedAccessToken: encryptSecret(refreshed.accessToken),
      ...(refreshed.tokenExpiresAt !== undefined
        ? { tokenExpiresAt: refreshed.tokenExpiresAt }
        : {}),
    },
    staffTimezone: timezone,
  };
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Google user lookup failed: ${await parseGoogleError(response)}`);
  }

  return (await response.json()) as GoogleUserInfo;
}

async function fetchGoogleCalendars(accessToken: string): Promise<Array<GoogleCalendarListEntry>> {
  const response = await fetch(`${GOOGLE_CALENDAR_API_BASE_URL}/users/me/calendarList`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Google calendar list failed: ${await parseGoogleError(response)}`);
  }

  const payload = (await response.json()) as GoogleCalendarListResponse;
  return (payload.items ?? []).filter((calendar) => typeof calendar.id === "string");
}

function buildGoogleEventPayload(context: NonNullable<AppointmentSyncContext>): Record<string, unknown> {
  const summary = context.serviceName;
  const descriptionLines = [
    `Appointment ID: ${String(context.appointment._id)}`,
    `Contact: ${context.contactName ?? "Unknown"} (${context.contactPhone})`,
    `Source: ${context.appointment.sourceChannel}`,
  ];

  return {
    summary,
    description: descriptionLines.join("\n"),
    start: {
      dateTime: context.appointment.startsAt,
      timeZone: context.appointment.timezone,
    },
    end: {
      dateTime: context.appointment.endsAt,
      timeZone: context.appointment.timezone,
    },
  };
}

export const completeOAuthCallback = internalAction({
  args: {
    code: v.string(),
    state: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ redirectUrl: string }> => {
    const oauthState: {
      provider: string;
      businessId: Id<"businesses">;
      userId: Id<"users">;
      staffId: Id<"staff">;
      nonce: string;
      expiresAt: string;
    } | null = await ctx.runMutation(
      internal.integrations.calendar.consumeCalendarOAuthState,
      {
        nonce: args.state,
      },
    );
    if (!oauthState) {
      throw new Error("Google Calendar connection request was not found.");
    }

    const tokenPayload = await exchangeAuthorizationCode(args.code);
    const accessToken = tokenPayload.access_token;
    if (!accessToken) {
      throw new Error("Google token exchange did not return an access token.");
    }

    const [userInfo, calendars] = await Promise.all([
      fetchGoogleUserInfo(accessToken),
      fetchGoogleCalendars(accessToken),
    ]);
    const selectedCalendar = pickDefaultCalendar(calendars);
    if (!selectedCalendar) {
      throw new Error("Google account does not have a writable calendar.");
    }

    const connectionId: Id<"calendar_connections"> = await ctx.runMutation(
      internal.integrations.calendar.upsertGoogleCalendarConnection,
      {
        businessId: oauthState.businessId,
        userId: oauthState.userId,
        staffId: oauthState.staffId,
        externalAccountId: userInfo.sub,
        ...(userInfo.email !== undefined ? { externalAccountEmail: userInfo.email } : {}),
        selectedCalendarId: selectedCalendar.id,
        selectedCalendarSummary: selectedCalendar.summary ?? selectedCalendar.id,
        encryptedAccessToken: encryptSecret(accessToken),
        ...(tokenPayload.refresh_token !== undefined
          ? { encryptedRefreshToken: encryptSecret(tokenPayload.refresh_token) }
          : {}),
        ...(tokenPayload.expires_in !== undefined
          ? { tokenExpiresAt: getTokenExpiryIso(tokenPayload.expires_in) }
          : {}),
      },
    );

    await ctx.runMutation(
      internal.ai.workflows.runtime.registerCalendarReconciliationCron,
      {
        businessId: oauthState.businessId,
      },
    );
    await ctx.runAction(internal.integrations.googleCalendar.syncBusyTimeForConnection, {
      connectionId,
      fullSync: true,
    });

    return {
      redirectUrl: buildSettingsRedirectUrl({
        status: "success",
        staffId: oauthState.staffId,
      }),
    };
  },
});

export const listAvailableCalendars = internalAction({
  args: {
    connectionId: v.id("calendar_connections"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ id: string; summary: string; primary: boolean; selected: boolean }>> => {
    const { accessToken, connection } = await withGoogleAccessToken(ctx, args.connectionId);
    const calendars = await fetchGoogleCalendars(accessToken);
    return calendars
      .filter((calendar) => isWritableCalendar(calendar.accessRole))
      .map((calendar) => ({
        id: calendar.id,
        summary: calendar.summary ?? calendar.id,
        primary: calendar.primary ?? false,
        selected: calendar.id === connection.selectedCalendarId,
      }));
  },
});

export const syncBusyTimeForConnection = internalAction({
  args: {
    connectionId: v.id("calendar_connections"),
    fullSync: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; mode: "full_resync" }
    | { ok: true; synced: number; removed: number }
  > => {
    const attemptedAt = new Date().toISOString();
    await ctx.runMutation(internal.integrations.calendar.recordCalendarConnectionSyncAttempt, {
      connectionId: args.connectionId,
      attemptedAt,
    });

    try {
      const { accessToken, connection, staffTimezone } = await withGoogleAccessToken(
        ctx,
        args.connectionId,
      );
      if (!connection.selectedCalendarId) {
        throw new Error("Google Calendar connection is missing a selected calendar.");
      }

      const doFullSync = args.fullSync === true || !connection.syncCursor;
      const syncWindowStartsAt =
        doFullSync
          ? DateTime.utc().startOf("day").toISO() ?? attemptedAt
          : connection.syncWindowStartsAt;

      const busyBlocks: Array<BusyBlockChange> = [];
      const removedExternalEventIds: Array<string> = [];
      let nextPageToken: string | undefined;
      let nextSyncToken = connection.syncCursor;

      do {
        const url = new URL(
          `${GOOGLE_CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(connection.selectedCalendarId)}/events`,
        );
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("showDeleted", "true");
        url.searchParams.set("maxResults", "2500");

        if (doFullSync) {
          url.searchParams.set("timeMin", syncWindowStartsAt ?? attemptedAt);
          url.searchParams.set(
            "timeMax",
            DateTime.fromISO(syncWindowStartsAt ?? attemptedAt, { zone: "utc" })
              .plus({ days: GOOGLE_SYNC_WINDOW_DAYS })
              .toISO() ?? attemptedAt,
          );
          url.searchParams.set("orderBy", "startTime");
        } else if (connection.syncCursor) {
          url.searchParams.set("syncToken", connection.syncCursor);
        }

        if (nextPageToken) {
          url.searchParams.set("pageToken", nextPageToken);
        }

        const response = await fetch(url, {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        if (response.status === 410 && !doFullSync) {
          await ctx.runAction(internal.integrations.googleCalendar.syncBusyTimeForConnection, {
            connectionId: args.connectionId,
            fullSync: true,
          });
          return { ok: true, mode: "full_resync" as const };
        }

        if (!response.ok) {
          throw new Error(`Google busy sync failed: ${await parseGoogleError(response)}`);
        }

        const payload = (await response.json()) as GoogleEventsResponse;
        for (const event of payload.items ?? []) {
          if (!event.id) {
            continue;
          }
          if (event.status === "cancelled" || event.transparency === "transparent") {
            removedExternalEventIds.push(event.id);
            continue;
          }

          const block = toBusyBlock(
            event,
            connection.selectedCalendarId,
            staffTimezone,
          );
          if (block) {
            busyBlocks.push(block);
          }
        }

        nextPageToken = payload.nextPageToken;
        if (payload.nextSyncToken) {
          nextSyncToken = payload.nextSyncToken;
        }
      } while (nextPageToken);

      await ctx.runMutation(internal.integrations.calendar.applyCalendarBusyBlockChanges, {
        connectionId: args.connectionId,
        fullSync: doFullSync,
        ...(nextSyncToken !== undefined ? { syncCursor: nextSyncToken } : {}),
        ...(syncWindowStartsAt !== undefined ? { syncWindowStartsAt } : {}),
        syncedAt: attemptedAt,
        busyBlocks,
        removedExternalEventIds,
      });

      return {
        ok: true,
        synced: busyBlocks.length,
        removed: removedExternalEventIds.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google busy sync failed.";
      await ctx.runMutation(internal.integrations.calendar.recordCalendarConnectionSyncFailure, {
        connectionId: args.connectionId,
        attemptedAt,
        message,
      });
      throw error;
    }
  },
});

export const syncAppointmentEvent = internalAction({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; status: "not_required" | "deleted" }
    | { ok: true; status: "synced"; externalEventId: string }
  > => {
    const context: AppointmentSyncContext = await ctx.runQuery(
      internal.integrations.calendar.getAppointmentCalendarSyncContext,
      {
        appointmentId: args.appointmentId,
      },
    );
    if (
      !context ||
      context.provider !== "google" ||
      !context.selectedConnectionId ||
      !context.selectedCalendarId
    ) {
      return { ok: true, status: "not_required" as const };
    }

    const { accessToken } = await withGoogleAccessToken(ctx, context.selectedConnectionId);
    const baseUrl = `${GOOGLE_CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(
      context.selectedCalendarId,
    )}/events`;

    if (context.appointment.status !== "confirmed") {
      if (context.appointment.calendarExternalEventId) {
        const response = await fetch(
          `${baseUrl}/${encodeURIComponent(context.appointment.calendarExternalEventId)}`,
          {
            method: "DELETE",
            headers: {
              authorization: `Bearer ${accessToken}`,
            },
          },
        );
        if (!response.ok && response.status !== 404) {
          throw new Error(`Google event delete failed: ${await parseGoogleError(response)}`);
        }
      }

      await ctx.runAction(internal.integrations.googleCalendar.syncBusyTimeForConnection, {
        connectionId: context.selectedConnectionId,
        fullSync: true,
      });
      return {
        ok: true,
        status: "deleted" as const,
      };
    }

    const eventPayload = buildGoogleEventPayload(context);
    const response = await fetch(
      context.appointment.calendarExternalEventId
        ? `${baseUrl}/${encodeURIComponent(context.appointment.calendarExternalEventId)}`
        : baseUrl,
      {
        method: context.appointment.calendarExternalEventId ? "PATCH" : "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(eventPayload),
      },
    );

    if (!response.ok) {
      throw new Error(`Google event sync failed: ${await parseGoogleError(response)}`);
    }

    const payload = (await response.json()) as GoogleCalendarEvent;
    if (!payload.id) {
      throw new Error("Google event sync response did not include an event ID.");
    }

    await ctx.runAction(internal.integrations.googleCalendar.syncBusyTimeForConnection, {
      connectionId: context.selectedConnectionId,
      fullSync: true,
    });

    return {
      ok: true,
      status: "synced" as const,
      externalEventId: payload.id,
    };
  },
});

export const startGoogleConnection = internalAction({
  args: {
    businessId: v.id("businesses"),
    staffId: v.id("staff"),
    authSubject: v.string(),
    authUserId: v.optional(v.id("users")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ authorizationUrl: string }> => {
    const accessContext: GoogleCalendarAccessContext = await ctx.runQuery(
      internal.integrations.calendar.getCalendarConnectionAccessContext,
      {
        businessId: args.businessId,
        staffId: args.staffId,
        authSubject: args.authSubject,
        ...(args.authUserId !== undefined ? { authUserId: args.authUserId } : {}),
      },
    );

    const nonce = randomBytes(24).toString("base64url");
    await ctx.runMutation(internal.integrations.calendar.createCalendarOAuthState, {
      provider: "google",
      businessId: accessContext.businessId,
      userId: accessContext.userId,
      staffId: accessContext.staffId,
      nonce,
      expiresAt: new Date(Date.now() + GOOGLE_OAUTH_STATE_TTL_MS).toISOString(),
    });

    return {
      authorizationUrl: buildGoogleAuthorizationUrl(nonce),
    };
  },
});

export const buildCallbackRedirect = internalAction({
  args: {
    status: v.union(v.literal("success"), v.literal("error")),
    staffId: v.optional(v.id("staff")),
    message: v.optional(v.string()),
  },
  handler: async (_ctx, args): Promise<{ redirectUrl: string }> => {
    return {
      redirectUrl: buildSettingsRedirectUrl(args),
    };
  },
});
