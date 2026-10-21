import { BUSINESS_HEADER, apiOperations, isUuid, type ApiOperation, type ApiOperationId, type ApiRequestBody, type ApiResponseBody } from "@lobbystack/shared";

import { ApiError, CliError, exitCodes } from "./errors";

type Spec<Id extends ApiOperationId> = (typeof apiOperations)[Id];
/** The {placeholders} in an operation's path, such as "rule_id". */
type PathParams<Path extends string> = Path extends `${string}{${infer Name}}${infer Rest}` ? Name | PathParams<Rest> : never;

/**
 * What a call needs, from the operation itself: its path values, its body
 * when it takes one, and an Idempotency-Key when it requires one. A command
 * that forgets one, or misspells a path value, doesn't compile.
 */
export type CallInput<Id extends ApiOperationId> =
  & ([PathParams<Spec<Id>["path"]>] extends [never] ? { params?: never } : { params: Record<PathParams<Spec<Id>["path"]>, string> })
  & (Spec<Id> extends { request: string } ? { body: ApiRequestBody<Id> } : { body?: never })
  & (Spec<Id> extends { idempotent: "required" } ? { idempotencyKey: string } : { idempotencyKey?: string })
  & { query?: Record<string, string | number | boolean | undefined> };

// The input may be left out only when nothing in it is required.
type CallArgs<Id extends ApiOperationId> = {} extends CallInput<Id> ? [input?: CallInput<Id>] : [input: CallInput<Id>];

export type ClientOptions = {
  /** The dashboard's origin. The API lives under /api/v1 there. */
  url: string;
  key: string;
  /** Sent as the LobbyStack-Business header, which a platform key needs to act on a business. */
  business?: string | undefined;
  fetch?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
};

export type Client = { call<Id extends ApiOperationId>(operationId: Id, ...args: CallArgs<Id>): Promise<ApiResponseBody<Id>> };

/** A path value, checked so it can only name one resource: an id where the path takes one, and never "." or "..". */
function pathValue(operation: ApiOperation, name: string, value: string | undefined): string {
  if (!value) throw new CliError(`Missing ${name}.`);
  const format = operation.params?.find((param) => param.in === "path" && param.name === name)?.schema.format;
  if (format === "uuid" ? !isUuid(value) : value === "." || value === "..") throw new CliError(`${name} must be an id, a UUID such as 5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f.`);
  return encodeURIComponent(value);
}

/**
 * Calls the v1 API by operation id. Paths, methods and the request and
 * response types come from the server's own operation registry, so the CLI
 * can't drift from the API.
 */
export function createClient(options: ClientOptions): Client {
  const send = options.fetch ?? fetch;
  return {
    async call<Id extends ApiOperationId>(operationId: Id, ...args: CallArgs<Id>): Promise<ApiResponseBody<Id>> {
      const input = (args[0] ?? {}) as { params?: Record<string, string>; query?: Record<string, string | number | boolean | undefined>; body?: unknown; idempotencyKey?: string };
      const operation: ApiOperation = apiOperations[operationId];
      const path = operation.path.replace(/\{([a-z_]+)\}/g, (_match, name: string) => pathValue(operation, name, input.params?.[name]));
      const url = new URL(`${options.url}/api/v1${path}`);
      for (const [name, value] of Object.entries(input.query ?? {})) {
        if (value !== undefined) url.searchParams.set(name, String(value));
      }
      const headers: Record<string, string> = { authorization: `Bearer ${options.key}`, accept: "application/json", "user-agent": options.userAgent ?? "lobbystack-cli" };
      // An operation that acts on no one business ignores the header, so it isn't sent.
      if (options.business && operation.business !== "none") headers[BUSINESS_HEADER] = options.business;
      if (input.idempotencyKey) headers["idempotency-key"] = input.idempotencyKey;
      if (input.body !== undefined) headers["content-type"] = "application/json";
      let response: Response;
      try {
        // A redirect would send the request somewhere the key wasn't saved for, so it stops here.
        response = await send(url, { method: operation.method, headers, redirect: "manual", ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}), signal: AbortSignal.timeout(options.timeoutMs ?? 60_000) });
      } catch (error) {
        throw new CliError(`Couldn't reach ${options.url}: ${error instanceof Error ? error.message : String(error)}`, exitCodes.failed);
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        throw new CliError(`${options.url} redirected the request${location ? ` to ${new URL(location, url).origin}` : ""}. Log in with the address the API is at.`);
      }
      const json = parseJson(await response.text());
      if (!response.ok) throw toApiError(response, json);
      if (json === undefined) throw new CliError(`${options.url} answered without JSON. Check that it's a LobbyStack dashboard's address.`, exitCodes.failed);
      return json as ApiResponseBody<Id>;
    },
  };
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function toApiError(response: Response, json: unknown): ApiError {
  const error = typeof json === "object" && json !== null ? (json as { error?: { code?: unknown; message?: unknown; details?: unknown } }).error : undefined;
  const details = Array.isArray(error?.details) ? error.details.filter((detail): detail is { path: string; message: string } => typeof detail?.path === "string" && typeof detail?.message === "string") : [];
  const message = typeof error?.message === "string" ? error.message : `The API answered ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`;
  return new ApiError(response.status, typeof error?.code === "string" ? error.code : "http_error", message, details);
}
