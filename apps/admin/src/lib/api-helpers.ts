import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { users, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { requireBusinessMembership } from "@lobbystack/domain";

import { runAfterResponse } from "./after-response";
import { getSession, type Session } from "./auth";
import { getDatabase } from "./databases";
import { reportServerError } from "./error-reporting";

export function getAppDatabase() {
  return getDatabase("lobbystack_app");
}

export function getWorkerDatabase() {
  return getDatabase("lobbystack_worker");
}

export function getDispatcherDatabase() {
  return getDatabase("lobbystack_dispatcher");
}

/** The finance endpoint may only use its separately provisioned read role. */
export function getFinanceExportDatabase() {
  if (!process.env.LOBBYSTACK_FINANCE_EXPORT_DATABASE_URL) {
    throw new Error("Finance export database role is not configured.");
  }
  return getDatabase("lobbystack_finance_export");
}

export function jsonError(message: string, status = 400, code?: string): NextResponse {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
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

/** The signed-in user and the business the request targets, for domain calls that open their own transaction. */
export async function requireOperatorBusiness(request: Request): Promise<{ session: NonNullable<Session>; businessId: string }> {
  const session = await requireApiSession(request);
  const businessId = businessIdFromRequest(request) ?? await activeBusinessIdForUser(session.user.id);
  if (!businessId) {
    throw jsonError("A businessId is required.", 400, "business_required");
  }
  return { session, businessId };
}

export async function withOperatorTransaction<T>(
  request: Request,
  callback: (input: { session: NonNullable<Session>; businessId: string; tx: DatabaseTransaction }) => Promise<T>,
  options: { minimumRole?: "viewer" | "scheduler" | "business_admin" | "business_owner" } = {},
): Promise<T> {
  const { session, businessId } = await requireOperatorBusiness(request);
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
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message = status >= 500 ? "Request failed." : error instanceof Error ? error.message : "Request failed.";
  if (status >= 500) {
    const errorId = crypto.randomUUID();
    runAfterResponse(() => reportServerError(error, { operation: "api_response", errorId }));
    return NextResponse.json({ error: message, errorId }, { status, headers: { "x-error-id": errorId } });
  }
  return jsonError(message, status, code);
}
