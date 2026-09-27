import type { ApiErrorCode } from "@lobbystack/shared";

/** An error with a stable public code. The v1 REST layer turns it into `{ error: { code, message } }`. */
export class PublicApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: Array<{ path: string; message: string }> | undefined;

  constructor(status: number, code: ApiErrorCode, message: string, details?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = "PublicApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what: string) => new PublicApiError(404, "not_found", `${what} not found.`);
export const invalidRequest = (message: string, details?: Array<{ path: string; message: string }>) => new PublicApiError(400, "invalid_request", message, details);
export const conflict = (message: string) => new PublicApiError(409, "conflict", message);
