import { NextResponse } from "next/server";

import { errorResponseSchema } from "@lobbystack/contracts";

import { AuthorizationError } from "./authorization";

export function jsonResponse<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function errorResponse(
  error: unknown,
  fallback = "Internal server error",
): NextResponse {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      errorResponseSchema.parse({
        error: error.message,
        code: error.status === 401 ? "unauthorized" : "forbidden",
      }),
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : fallback;
  console.error(error);
  return NextResponse.json(
    errorResponseSchema.parse({
      error: message,
      code: "internal_error",
    }),
    { status: 500 },
  );
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}
