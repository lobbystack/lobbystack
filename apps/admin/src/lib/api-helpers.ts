import { after, NextResponse } from "next/server";
import { reportServerError } from "./error-reporting";
import { eq } from "drizzle-orm";

import { createDatabaseClient, users, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { requireBusinessMembership } from "@lobbystack/domain";

import { getSession, type Session } from "./auth";
import { claimInternalRequestNonce, verifyInternalRequest } from "./internal-auth";

export type ApiErrorPayload = {
  error: string;
  code?: string;
};

export type ApiPagination = {
  limit: number;
  offset: number;
  total?: number;
  hasNext: boolean;
};

export type ApiMutationPayload<T extends Record<string, unknown> = Record<string, never>> = {
  ok: true;
} & T;

let appDatabase: ReturnType<typeof createDatabaseClient> | undefined;
let workerDatabase: ReturnType<typeof createDatabaseClient> | undefined;
let dispatcherDatabase: ReturnType<typeof createDatabaseClient> | undefined;
let financeExportDatabase: ReturnType<typeof createDatabaseClient> | undefined;

export function getAppDatabase() {
  if (!appDatabase) {
    appDatabase = createDatabaseClient("lobbystack_app");
  }
  return appDatabase;
}

export function getWorkerDatabase() {
  if (!workerDatabase) {
    workerDatabase = createDatabaseClient("lobbystack_worker");
  }
  return workerDatabase;
}

export function getDispatcherDatabase() {
  if (!dispatcherDatabase) {
    dispatcherDatabase = createDatabaseClient("lobbystack_dispatcher");
  }
  return dispatcherDatabase;
}

/** The finance endpoint may only use its separately provisioned read role. */
export function getFinanceExportDatabase() {
  if (!process.env.LOBBYSTACK_FINANCE_EXPORT_DATABASE_URL) {
    throw new Error("Finance export database role is not configured.");
  }
  if (!financeExportDatabase) {
    financeExportDatabase = createDatabaseClient("lobbystack_finance_export");
  }
  return financeExportDatabase;
}

export function jsonError(message: string, status = 400, code?: string): NextResponse {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

export function parsePagination(request: Request, defaults: { limit?: number; maxLimit?: number } = {}): { limit: number; offset: number } {
  const url = new URL(request.url);
  const maxLimit = defaults.maxLimit ?? 100;
  const requestedLimit = Number(url.searchParams.get("limit") ?? defaults.limit ?? 50);
  const requestedOffset = Number(url.searchParams.get("offset") ?? 0);
  return {
    limit: Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), maxLimit) : defaults.limit ?? 50,
    offset: Number.isFinite(requestedOffset) ? Math.max(Math.trunc(requestedOffset), 0) : 0,
  };
}

export function mutationResponse<T extends Record<string, unknown> = Record<string, never>>(data?: T, status = 200): NextResponse<ApiMutationPayload<T>> {
  return NextResponse.json({ ok: true, ...(data ?? {}) } as ApiMutationPayload<T>, { status });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw jsonError("Invalid JSON body.", 400, "invalid_json");
  }
}

export async function requireApiSession(request: Request): Promise<NonNullable<Session>> {
  try {
    const session = await getSession(request.headers);
    if (!session) {
      throw jsonError("Authentication required.", 401, "unauthorized");
    }
    return session;
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    throw jsonError("Authentication service unavailable.", 503, "auth_unavailable");
  }
}

export async function requireProspectDemoOperator(request: Request): Promise<NonNullable<Session>> {
  const session = await requireApiSession(request);
  const operatorEmail = process.env.PROSPECT_DEMO_OPERATOR_EMAIL?.trim().toLowerCase();
  if (!operatorEmail) throw jsonError("Prospect demo operations are not configured.", 503, "demo_operator_unconfigured");
  if (session.user.email?.trim().toLowerCase() !== operatorEmail) throw jsonError("Prospect demo operator access is required.", 403, "forbidden");
  return session;
}

export function businessIdFromRequest(request: Request): string | null {
  return new URL(request.url).searchParams.get("businessId") ?? request.headers.get("x-business-id");
}

async function activeBusinessIdForUser(userId: string): Promise<string | null> {
  return await withBusinessTransaction(getAppDatabase().db, { userId, actorType: "operator" }, async (tx) => {
    const [user] = await tx
      .select({ activeBusinessId: users.activeBusinessId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.activeBusinessId ?? null;
  });
}

export async function requireInternalService(request: Request, body: string | Uint8Array): Promise<void> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (process.env.NODE_ENV !== "production" && token && request.headers.get("x-internal-service-token") === token) {
    return;
  }
  const serviceId = request.headers.get("x-service-id") ?? "unknown";
  const nonce = request.headers.get("x-service-nonce");
  const valid = verifyInternalRequest({
    serviceId,
    timestamp: request.headers.get("x-service-timestamp"),
    nonce,
    bodyHash: request.headers.get("x-body-sha256"),
    signature: request.headers.get("x-service-signature"),
    body,
  });
  if (!valid) {
    throw jsonError("Unauthorized internal request.", 401, "internal_unauthorized");
  }
  const claim = await claimInternalRequestNonce({ serviceId, nonce: nonce!, maxAgeMs: 30_000 });
  if (claim === "replayed") {
    throw jsonError("The internal request has already been used.", 401, "internal_replay");
  }
  if (claim === "unavailable") {
    throw jsonError("Internal request replay protection is unavailable.", 503, "internal_replay_unavailable");
  }
}

export async function withOperatorTransaction<T>(
  request: Request,
  callback: (input: { session: NonNullable<Session>; businessId: string; tx: DatabaseTransaction }) => Promise<T>,
  options: { minimumRole?: "viewer" | "scheduler" | "business_admin" | "business_owner" } = {},
): Promise<T> {
  const session = await requireApiSession(request);
  const businessId = businessIdFromRequest(request) ?? await activeBusinessIdForUser(session.user.id);
  if (!businessId) {
    throw jsonError("A businessId is required.", 400, "business_required");
  }
  return await withBusinessTransaction(getAppDatabase().db, { userId: session.user.id, businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, { userId: session.user.id, businessId, ...(options.minimumRole ? { minimumRole: options.minimumRole } : {}) });
    return await callback({ session, businessId, tx });
  });
}

export function asApiResponse(error: unknown): NextResponse {
  if (error instanceof NextResponse) {
    return error;
  }
  if (error instanceof Response) {
    return NextResponse.json({ error: "Request failed." }, { status: error.status });
  }
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
  const message = status >= 500 ? "Request failed." : error instanceof Error ? error.message : "Request failed.";
  if (status >= 500) {
    const errorId = crypto.randomUUID();
    const report = () => reportServerError(error, { operation: "api_response", errorId });
    try { after(report); } catch { void report(); }
    return NextResponse.json({ error: message, errorId }, { status, headers: { "x-error-id": errorId } });
  }
  return jsonError(message, status);
}
